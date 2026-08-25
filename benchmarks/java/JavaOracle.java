import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import javax.lang.model.element.Element;
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.ExecutableElement;
import javax.lang.model.element.TypeElement;
import javax.lang.model.type.TypeKind;
import javax.lang.model.type.TypeMirror;
import javax.lang.model.util.Elements;
import javax.lang.model.util.Types;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.ImportTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;

/** Independent javac-AST oracle for fixed large Java source corpora. */
public final class JavaOracle {
  private record Endpoint(String filePath, String name, String kind, long line, long column) {}

  private record Occurrence(String filePath, String name, long line, long column) {}

  private record Fact(
      String type,
      String stratum,
      String kind,
      Endpoint source,
      Endpoint target,
      Occurrence occurrence) {}

  private final Path root;
  private final Trees trees;
  private final SourcePositions positions;
  private final Elements elements;
  private final Types types;
  private final List<CompilationUnitTree> units;
  private final Map<Element, Endpoint> endpoints = new IdentityHashMap<>();
  private final Map<Element, TreePath> declarationPaths = new IdentityHashMap<>();
  private final Map<String, Integer> declaredTypeQualifiedNameCounts = new LinkedHashMap<>();
  private final Map<CompilationUnitTree, Endpoint> fileEndpoints = new IdentityHashMap<>();
  private final List<Fact> facts = new ArrayList<>();

  private JavaOracle(
      Path root,
      Trees trees,
      Elements elements,
      Types types,
      List<CompilationUnitTree> units) {
    this.root = root;
    this.trees = trees;
    this.positions = trees.getSourcePositions();
    this.elements = elements;
    this.types = types;
    this.units = units;
  }

  public static void main(String[] arguments) throws Exception {
    if (arguments.length != 1) {
      System.err.println("Usage: JavaOracle <project-root>");
      System.exit(2);
    }
    Path root = Path.of(arguments[0]).toAbsolutePath().normalize();
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    if (compiler == null) {
      throw new IllegalStateException("A full JDK with javac is required.");
    }
    List<Path> sources = discoverSources(root);
    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    try (StandardJavaFileManager files = compiler.getStandardFileManager(
        diagnostics, null, StandardCharsets.UTF_8)) {
      Iterable<? extends JavaFileObject> inputs = files.getJavaFileObjectsFromPaths(sources);
      JavacTask task = (JavacTask) compiler.getTask(
          null,
          files,
          diagnostics,
          List.of("-proc:none", "-Xlint:none", "-XDshould-stop.ifError=FLOW"),
          null,
          inputs);
      List<CompilationUnitTree> units = new ArrayList<>();
      task.parse().forEach(units::add);
      try {
        task.analyze();
      } catch (RuntimeException ignored) {
        // Missing external dependencies may stop attribution for part of a corpus. Facts are
        // emitted only where javac still exposes a concrete source element.
      }
      JavaOracle oracle = new JavaOracle(
          root,
          Trees.instance(task),
          task.getElements(),
          task.getTypes(),
          units);
      oracle.collect();
      oracle.writeFacts();
    }
  }

  private static List<Path> discoverSources(Path root) throws IOException {
    Set<String> excluded = Set.of(".git", ".SymbolLattice", ".gradle", "build", "target", "out");
    try (Stream<Path> paths = Files.walk(root)) {
      return paths
          .filter(Files::isRegularFile)
          .filter(path -> path.getFileName().toString().endsWith(".java"))
          .filter(path -> !containsExcluded(root.relativize(path), excluded))
          .sorted(Comparator.comparing(path -> normalize(root.relativize(path))))
          .toList();
    }
  }

  private static boolean containsExcluded(Path relative, Set<String> excluded) {
    for (Path segment : relative) {
      if (excluded.contains(segment.toString())) return true;
    }
    return false;
  }

  private static String normalize(Path path) {
    return path.toString().replace('\\', '/');
  }

  private void collect() {
    for (CompilationUnitTree unit : units) {
      String filePath = filePath(unit);
      Endpoint file = new Endpoint(filePath, Path.of(filePath).getFileName().toString(), "file", 1, 1);
      fileEndpoints.put(unit, file);
      new DeclarationScanner(unit).scan(unit, null);
    }
    for (CompilationUnitTree unit : units) {
      new RelationScanner(unit).scan(unit, null);
    }
    collectOverrides();
  }

  private final class DeclarationScanner extends TreePathScanner<Void, Void> {
    private final CompilationUnitTree unit;
    private final Deque<Endpoint> containers = new ArrayDeque<>();

    private DeclarationScanner(CompilationUnitTree unit) {
      this.unit = unit;
    }

    @Override
    public Void visitClass(ClassTree tree, Void unused) {
      Element element = trees.getElement(getCurrentPath());
      TreePath parentPath = getCurrentPath().getParentPath();
      boolean isDirectTopLevel = parentPath != null && parentPath.getLeaf() instanceof CompilationUnitTree;
      boolean isSupportedType = element != null &&
          (element.getKind() == ElementKind.CLASS ||
           element.getKind() == ElementKind.INTERFACE ||
           element.getKind() == ElementKind.ANNOTATION_TYPE);
      if (!isDirectTopLevel || !isSupportedType) return null;
      Endpoint endpoint = endpointFor(element, unit, tree);
      if (endpoint == null) return null;
      register(element, endpoint, getCurrentPath());
      facts.add(new Fact("positive", "identity", "identity", null, endpoint, occurrence(unit, tree, endpoint.name)));
      Endpoint container = containers.peekLast();
      if (container == null) container = fileEndpoints.get(unit);
      facts.add(new Fact("positive", "containment", "contains", container, endpoint, occurrence(unit, tree, endpoint.name)));
      containers.addLast(endpoint);
      super.visitClass(tree, unused);
      containers.removeLast();
      return null;
    }

    @Override
    public Void visitMethod(MethodTree tree, Void unused) {
      Element element = trees.getElement(getCurrentPath());
      if (positions.getStartPosition(unit, tree) < 0) return null;
      Endpoint endpoint = endpointFor(element, unit, tree);
      if (endpoint != null) {
        register(element, endpoint, getCurrentPath());
        String stratum = element.getKind() == ElementKind.CONSTRUCTOR ? "constructor-identity" : "identity";
        facts.add(new Fact("positive", stratum, "identity", null, endpoint, occurrence(unit, tree, endpoint.name)));
        Endpoint container = containers.peekLast();
        if (container != null) {
          facts.add(new Fact("positive", "containment", "contains", container, endpoint, occurrence(unit, tree, endpoint.name)));
        }
      }
      return super.visitMethod(tree, unused);
    }

    private void register(Element element, Endpoint endpoint, TreePath path) {
      if (element != null) {
        endpoints.put(element, endpoint);
        declarationPaths.put(element, path);
        if (element instanceof TypeElement typeElement) {
          declaredTypeQualifiedNameCounts.merge(
              typeElement.getQualifiedName().toString(), 1, Integer::sum);
        }
      }
    }
  }

  private final class RelationScanner extends TreePathScanner<Void, Void> {
    private final CompilationUnitTree unit;
    private final Deque<Endpoint> callables = new ArrayDeque<>();

    private RelationScanner(CompilationUnitTree unit) {
      this.unit = unit;
    }

    @Override
    public Void visitMethod(MethodTree tree, Void unused) {
      Endpoint endpoint = endpoints.get(trees.getElement(getCurrentPath()));
      if (endpoint == null) return super.visitMethod(tree, unused);
      callables.addLast(endpoint);
      collectSignatureFacts(tree, getCurrentPath(), endpoint);
      super.visitMethod(tree, unused);
      callables.removeLast();
      return null;
    }

    @Override
    public Void visitClass(ClassTree tree, Void unused) {
      Endpoint source = endpoints.get(trees.getElement(getCurrentPath()));
      if (source == null) return null;
      if (tree.getExtendsClause() != null) {
        addTypeRelation("heritage", "extends", source, tree.getExtendsClause(), getCurrentPath());
      }
      for (Tree implemented : tree.getImplementsClause()) {
        String kind = tree.getKind() == Tree.Kind.INTERFACE ? "extends" : "implements";
        addTypeRelation("heritage", kind, source, implemented, getCurrentPath());
      }
      return super.visitClass(tree, unused);
    }

    @Override
    public Void visitImport(ImportTree tree, Void unused) {
      if (!tree.isStatic()) {
        TreePath path = new TreePath(getCurrentPath(), tree.getQualifiedIdentifier());
        Endpoint target = endpoints.get(trees.getElement(path));
        if (target != null) {
          facts.add(new Fact(
              "positive", "import", "imports", fileEndpoints.get(unit), target,
              occurrence(unit, tree.getQualifiedIdentifier(), target.name)));
        }
      }
      return super.visitImport(tree, unused);
    }

    @Override
    public Void visitAnnotation(AnnotationTree tree, Void unused) {
      Endpoint source = callables.peekLast();
      if (source == null) return super.visitAnnotation(tree, unused);
      TreePath path = new TreePath(getCurrentPath(), tree.getAnnotationType());
      Element targetElement = trees.getElement(path);
      Endpoint target = endpoints.get(targetElement);
      if (target != null &&
          targetElement != null &&
          targetElement.getKind() == ElementKind.ANNOTATION_TYPE &&
          targetElement instanceof TypeElement typeElement &&
          declaredTypeQualifiedNameCounts.getOrDefault(
              typeElement.getQualifiedName().toString(), 0) == 1) {
        facts.add(new Fact(
            "positive", "annotation", "references", source, target,
            occurrence(unit, tree.getAnnotationType(), target.name)));
      }
      return super.visitAnnotation(tree, unused);
    }

    @Override
    public Void visitMethodInvocation(MethodInvocationTree tree, Void unused) {
      Endpoint source = callables.peekLast();
      if (source != null) {
        Element element = trees.getElement(getCurrentPath());
        Endpoint target = endpoints.get(element);
        ExpressionTree select = tree.getMethodSelect();
        String name = select instanceof IdentifierTree identifier
            ? identifier.getName().toString()
            : select instanceof MemberSelectTree member ? member.getIdentifier().toString() : select.toString();
        Occurrence occurrence = occurrenceEndingWithName(unit, select, name);
        if (target != null) {
          facts.add(new Fact("positive", "call", "calls", source, target, occurrence));
        } else if (element != null && !name.equals("super") && !name.equals("this")) {
          facts.add(new Fact("negative", "external-call", "calls", source, null, occurrence));
        }
      }
      return super.visitMethodInvocation(tree, unused);
    }

    @Override
    public Void visitNewClass(NewClassTree tree, Void unused) {
      Endpoint source = callables.peekLast();
      if (source != null) {
        Element element = trees.getElement(getCurrentPath());
        Element constructedType = trees.getElement(new TreePath(getCurrentPath(), tree.getIdentifier()));
        Endpoint target = constructedType == null ? null : endpoints.get(constructedType);
        if (target == null && element != null && tree.getClassBody() == null) {
          target = endpoints.get(element.getEnclosingElement());
        }
        String name = simpleName(tree.getIdentifier().toString());
        Occurrence occurrence = occurrence(unit, tree.getIdentifier(), name);
        if (target != null) {
          facts.add(new Fact("positive", "instantiation", "instantiates", source, target, occurrence));
        } else if (element != null) {
          facts.add(new Fact("negative", "external-instantiation", "instantiates", source, null, occurrence));
        }
      }
      return super.visitNewClass(tree, unused);
    }

    private void collectSignatureFacts(MethodTree tree, TreePath methodPath, Endpoint source) {
      if (tree.getReturnType() != null) {
        addTypeRelation("signature", "returns", source, tree.getReturnType(), methodPath);
      }
      for (VariableTree parameter : tree.getParameters()) {
        addTypeRelation("signature", "accepts", source, parameter.getType(), new TreePath(methodPath, parameter));
      }
    }

    private void addTypeRelation(String stratum, String kind, Endpoint source, Tree typeTree, TreePath parent) {
      TreePath path = new TreePath(parent, typeTree);
      Endpoint target = endpointForType(path);
      if (target != null) {
        facts.add(new Fact("positive", stratum, kind, source, target, occurrence(unit, typeTree, target.name)));
      }
    }
  }

  private Endpoint endpointForType(TreePath path) {
    Element direct = trees.getElement(path);
    Endpoint endpoint = endpoints.get(direct);
    if (endpoint != null) return endpoint;
    TypeMirror mirror = trees.getTypeMirror(path);
    if (mirror == null || mirror.getKind() == TypeKind.ERROR || mirror.getKind().isPrimitive()) return null;
    Element element = types.asElement(mirror);
    return endpoints.get(element);
  }

  private void collectOverrides() {
    for (Map.Entry<Element, Endpoint> entry : endpoints.entrySet()) {
      if (!(entry.getKey() instanceof ExecutableElement method) || method.getKind() != ElementKind.METHOD) continue;
      Element enclosing = method.getEnclosingElement();
      if (!(enclosing instanceof TypeElement owner)) continue;
      Map<String, Endpoint> candidates = new LinkedHashMap<>();
      for (Element member : elements.getAllMembers(owner)) {
        if (!(member instanceof ExecutableElement candidate) || candidate.equals(method)) continue;
        // A declaration cannot override an overload declared by the same owner. javac can
        // otherwise report a false positive here after attribution stops on a missing
        // external classpath, which would corrupt the independent truth set.
        if (candidate.getEnclosingElement().equals(owner)) continue;
        Endpoint target = endpoints.get(candidate);
        if (target != null && elements.overrides(method, candidate, owner)) {
          candidates.put(target.filePath + "\u0000" + target.line + "\u0000" + target.name, target);
        }
      }
      if (candidates.size() == 1) {
        Endpoint source = entry.getValue();
        Endpoint target = candidates.values().iterator().next();
        TreePath path = declarationPaths.get(method);
        if (path != null) {
          facts.add(new Fact(
              "positive", "override", "overrides", source, target,
              occurrence(path.getCompilationUnit(), path.getLeaf(), source.name)));
        }
      }
    }
  }

  private Endpoint endpointFor(Element element, CompilationUnitTree unit, Tree tree) {
    if (element == null) return null;
    String kind;
    String name = element.getSimpleName().toString();
    if (element.getKind() == ElementKind.CONSTRUCTOR) {
      kind = "method";
      name = element.getEnclosingElement().getSimpleName().toString();
    } else if (element.getKind() == ElementKind.METHOD) {
      kind = "method";
    } else if (element.getKind().isInterface()) {
      kind = "interface";
    } else if (element.getKind().isClass() || element.getKind() == ElementKind.ENUM || element.getKind() == ElementKind.RECORD) {
      kind = "class";
    } else {
      return null;
    }
    long start = positions.getStartPosition(unit, tree);
    if (start < 0) return null;
    return new Endpoint(
        filePath(unit), name, kind,
        unit.getLineMap().getLineNumber(start), unit.getLineMap().getColumnNumber(start));
  }

  private Occurrence occurrence(CompilationUnitTree unit, Tree tree, String name) {
    long start = positions.getStartPosition(unit, tree);
    long end = positions.getEndPosition(unit, tree);
    if (start < 0) start = 0;
    if (end < start) end = start;
    String text = sourceSlice(unit, start, end);
    int offset = text.indexOf(name);
    long nameStart = offset < 0 ? start : start + offset;
    return rawOccurrence(unit, name, nameStart);
  }

  private Occurrence occurrenceEndingWithName(CompilationUnitTree unit, Tree tree, String name) {
    long start = positions.getStartPosition(unit, tree);
    long end = positions.getEndPosition(unit, tree);
    if (start < 0) start = 0;
    if (end < start) end = start;
    String text = sourceSlice(unit, start, end);
    int offset = text.lastIndexOf(name);
    long nameStart = offset < 0 ? start : start + offset;
    return rawOccurrence(unit, name, nameStart);
  }

  private Occurrence rawOccurrence(CompilationUnitTree unit, String name, long offset) {
    String content = sourceSlice(unit, 0, Long.MAX_VALUE);
    int safeOffset = (int) Math.max(0, Math.min(offset, content.length()));
    int line = 1;
    int lineStart = 0;
    for (int index = 0; index < safeOffset; index++) {
      if (content.charAt(index) == '\n') {
        line += 1;
        lineStart = index + 1;
      }
    }
    return new Occurrence(filePath(unit), name, line, safeOffset - lineStart + 1);
  }

  private String sourceSlice(CompilationUnitTree unit, long start, long end) {
    try {
      CharSequence content = unit.getSourceFile().getCharContent(true);
      int safeStart = (int) Math.max(0, Math.min(start, content.length()));
      int safeEnd = (int) Math.max(safeStart, Math.min(end, content.length()));
      return content.subSequence(safeStart, safeEnd).toString();
    } catch (IOException error) {
      return "";
    }
  }

  private String filePath(CompilationUnitTree unit) {
    URI uri = unit.getSourceFile().toUri();
    return normalize(root.relativize(Path.of(uri).toAbsolutePath().normalize()));
  }

  private static String simpleName(String text) {
    String value = text.replaceAll("<.*>", "");
    int dot = value.lastIndexOf('.');
    return dot < 0 ? value : value.substring(dot + 1);
  }

  private void writeFacts() {
    facts.stream()
        .sorted(Comparator
            .comparing((Fact fact) -> fact.occurrence.filePath)
            .thenComparingLong(fact -> fact.occurrence.line)
            .thenComparingLong(fact -> fact.occurrence.column)
            .thenComparing(fact -> fact.kind)
            .thenComparing(fact -> fact.stratum))
        .forEach(fact -> System.out.println(toJson(fact)));
  }

  private static String toJson(Fact fact) {
    return "{\"type\":\"" + escape(fact.type) + "\",\"stratum\":\"" + escape(fact.stratum)
        + "\",\"kind\":\"" + escape(fact.kind) + "\",\"source\":" + endpointJson(fact.source)
        + ",\"target\":" + endpointJson(fact.target) + ",\"occurrence\":" + occurrenceJson(fact.occurrence) + "}";
  }

  private static String endpointJson(Endpoint endpoint) {
    if (endpoint == null) return "null";
    return "{\"filePath\":\"" + escape(endpoint.filePath) + "\",\"name\":\"" + escape(endpoint.name)
        + "\",\"kind\":\"" + escape(endpoint.kind) + "\",\"line\":" + endpoint.line
        + ",\"column\":" + endpoint.column + "}";
  }

  private static String occurrenceJson(Occurrence occurrence) {
    return "{\"filePath\":\"" + escape(occurrence.filePath) + "\",\"name\":\"" + escape(occurrence.name)
        + "\",\"line\":" + occurrence.line + ",\"column\":" + occurrence.column + "}";
  }

  private static String escape(String value) {
    StringBuilder result = new StringBuilder();
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      switch (character) {
        case '\\' -> result.append("\\\\");
        case '"' -> result.append("\\\"");
        case '\n' -> result.append("\\n");
        case '\r' -> result.append("\\r");
        case '\t' -> result.append("\\t");
        default -> {
          if (character < 0x20) result.append(String.format("\\u%04x", (int) character));
          else result.append(character);
        }
      }
    }
    return result.toString();
  }
}
