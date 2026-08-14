import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { SqliteGraphStore } from "../dist/infrastructure/sqlite/index.js";

const BASELINE_COMMIT = "a3e44ecbcd05b31f3eeec428c0571bf1bba1ad29";
const BENCHMARK_VERSION = "typescript-self-hosting-ground-truth-v1";
const EXPECTED_POSITIVE_SLICES = Object.freeze({
  identities: 50,
  moduleEdges: 50,
  callsAndInstantiates: 80,
  signaturesAndHeritage: 40,
  crossLayerAndTestImpact: 30
});
const EXPECTED_NEGATIVE_ASSERTIONS = 100;

const SELECTED_FILES = Object.freeze([
  "src/application/auto-sync-host-registry.ts",
  "src/application/auto-sync-journal.ts",
  "src/application/auto-sync-owner.ts",
  "src/application/auto-sync-restart.ts",
  "src/application/auto-sync-start.ts",
  "src/application/auto-sync-stop.ts",
  "src/application/context-allocation.ts",
  "src/application/explore-path-spines.ts",
  "src/application/file-inventory.ts",
  "src/application/generated-ranking.ts",
  "src/benchmark/comparison-adapters.ts",
  "src/benchmark/comparison-metrics.ts",
  "src/benchmark/operation-samples.ts",
  "src/benchmark/read-query-metrics.ts",
  "src/domain/generated-files.ts",
  "src/domain/ids.ts",
  "src/domain/index-inputs.ts",
  "src/domain/index-work.ts",
  "src/domain/source-roles.ts",
  "src/domain/source-search.ts",
  "src/infrastructure/filesystem/astro-project.ts",
  "src/infrastructure/filesystem/auto-sync-host-registry.ts",
  "src/infrastructure/filesystem/configuration-discovery.ts",
  "src/infrastructure/filesystem/project-inputs.ts",
  "src/infrastructure/filesystem/source-catalog.ts",
  "src/infrastructure/filesystem/watch-source.ts",
  "src/mcp/read-query-protocol.ts",
  "src/mcp/read-query-worker.ts",
  "src/ports/graph-store.ts",
  "src/ports/source-catalog.ts",
  "test/integration/filesystem/auto-sync-host-registry.test.ts",
  "test/unit/application/generated-ranking.test.ts",
  "test/unit/domain/file-inventory.test.ts",
  "test/unit/domain/generated-files.test.ts",
  "test/unit/domain/source-search.test.ts",
  "test/unit/filesystem/astro-project.test.ts",
  "test/unit/filesystem/source-catalog.test.ts",
  "test/unit/ids.test.ts",
  "test/unit/release-workflow.test.ts",
  "test/unit/source-pointer.test.ts"
]);

function parseArguments(argv) {
  const options = { projectPath: process.cwd(), output: undefined, mode: "baseline" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--project") {
      options.projectPath = resolve(argv[++index] ?? "");
      continue;
    }
    if (argument === "--output") {
      options.output = resolve(argv[++index] ?? "");
      continue;
    }
    if (argument === "--mode") {
      const mode = argv[++index];
      if (mode !== "baseline" && mode !== "postfix") {
        throw new Error(`Unsupported benchmark mode: ${mode ?? ""}`);
      }
      options.mode = mode;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function projectRelativePath(projectPath, fileName) {
  return relative(projectPath, fileName).split(sep).join("/");
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex").toUpperCase();
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rangeContainsPosition(range, line, column) {
  const afterStart = line > range.start.line || (line === range.start.line && column >= range.start.column);
  const beforeEnd = line < range.end.line || (line === range.end.line && column <= range.end.column);
  return afterStart && beforeEnd;
}

function declarationNameNode(node) {
  if (ts.isConstructorDeclaration(node)) {
    return node.getChildren(node.getSourceFile()).find(
      (child) => child.kind === ts.SyntaxKind.ConstructorKeyword
    );
  }
  if (
    (ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isVariableDeclaration(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return node.name;
  }
  return undefined;
}

function declarationGraphKind(node) {
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return "method";
  if (ts.isConstructorDeclaration(node)) return "method";
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isVariableDeclaration(node)) {
    return "variable";
  }
  return undefined;
}

function sourceLocation(sourceFile, node) {
  const start = node.getStart(sourceFile);
  const position = sourceFile.getLineAndCharacterOfPosition(start);
  return { line: position.line + 1, column: position.character + 1 };
}

function declarationNameText(nameNode, sourceFile) {
  return typeof nameNode.text === "string" ? nameNode.text : nameNode.getText(sourceFile);
}

function symbolSpan(symbol) {
  return (
    (symbol.range.end.line - symbol.range.start.line) * 100_000 +
    symbol.range.end.column -
    symbol.range.start.column
  );
}

function graphSymbolForDeclaration(graphSymbolsByFile, projectPath, declaration) {
  const sourceFile = declaration.getSourceFile();
  const filePath = projectRelativePath(projectPath, sourceFile.fileName);
  const nameNode = declarationNameNode(declaration);
  const kind = declarationGraphKind(declaration);
  if (nameNode === undefined || kind === undefined) return undefined;
  const location = sourceLocation(sourceFile, nameNode);
  const name = declarationNameText(nameNode, sourceFile);
  return (graphSymbolsByFile.get(filePath) ?? [])
    .filter(
      (symbol) =>
        symbol.name === name &&
        symbol.kind === kind &&
        rangeContainsPosition(symbol.range, location.line, location.column)
    )
    .sort((left, right) => symbolSpan(left) - symbolSpan(right) || compareText(left.id, right.id))[0];
}

function resolvedCompilerSymbol(checker, symbol) {
  if (symbol === undefined) return undefined;
  let current = symbol;
  const seen = new Set();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
    seen.add(current);
    const resolved = checker.getAliasedSymbol(current);
    if (resolved === current) break;
    current = resolved;
  }
  return current;
}

function graphSymbolForCompilerSymbol(checker, graphSymbolsByFile, projectPath, compilerSymbol) {
  const resolved = resolvedCompilerSymbol(checker, compilerSymbol);
  if (resolved === undefined) return undefined;
  const declarations = [resolved.valueDeclaration, ...(resolved.declarations ?? [])].filter(Boolean);
  for (const declaration of declarations) {
    const graphSymbol = graphSymbolForDeclaration(graphSymbolsByFile, projectPath, declaration);
    if (graphSymbol !== undefined) return graphSymbol;
  }
  return undefined;
}

function fileGraphSymbol(graphSymbolsByFile, filePath) {
  return (graphSymbolsByFile.get(filePath) ?? []).find((symbol) => symbol.kind === "file");
}

function enclosingSourceGraphSymbol(graphSymbolsByFile, projectPath, node, preferInitializerVariable = false) {
  let current = node.parent;
  let topLevelVariable;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
      if (preferInitializerVariable && topLevelVariable !== undefined) return topLevelVariable;
      const graphSymbol = graphSymbolForDeclaration(graphSymbolsByFile, projectPath, current);
      if (graphSymbol !== undefined) return graphSymbol;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const owner = current.parent;
      if (ts.isVariableDeclaration(owner) || ts.isPropertyDeclaration(owner)) {
        const graphSymbol = graphSymbolForDeclaration(graphSymbolsByFile, projectPath, owner);
        if (graphSymbol !== undefined) return graphSymbol;
      }
    }
    if ((ts.isVariableDeclaration(current) || ts.isPropertyDeclaration(current)) && topLevelVariable === undefined) {
      topLevelVariable = graphSymbolForDeclaration(graphSymbolsByFile, projectPath, current);
    }
    current = current.parent;
  }
  if (topLevelVariable !== undefined) return topLevelVariable;
  const sourceFile = node.getSourceFile();
  return fileGraphSymbol(graphSymbolsByFile, projectRelativePath(projectPath, sourceFile.fileName));
}

function typeGraphTargets(checker, graphSymbolsByFile, projectPath, typeNode) {
  const targets = new Map();
  const visit = (node) => {
    let symbolNode;
    if (ts.isTypeReferenceNode(node)) {
      symbolNode = node.typeName;
    } else if (ts.isExpressionWithTypeArguments(node)) {
      symbolNode = node.expression;
    } else if (ts.isTypeQueryNode(node)) {
      symbolNode = node.exprName;
    }
    if (symbolNode !== undefined) {
      const target = graphSymbolForCompilerSymbol(
        checker,
        graphSymbolsByFile,
        projectPath,
        checker.getSymbolAtLocation(symbolNode)
      );
      if (target !== undefined) targets.set(target.id, { target, symbolNode });
    }
    ts.forEachChild(node, visit);
  };
  visit(typeNode);
  return [...targets.values()];
}

function compilerConfiguration(projectPath) {
  const configurationPath = resolve(projectPath, "tsconfig.test.json");
  const read = ts.readConfigFile(configurationPath, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, projectPath, undefined, configurationPath);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
  }
  return parsed;
}

function moduleTargetFile(program, compilerOptions, projectPath, containingFile, specifier) {
  const resolvedModule = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys).resolvedModule;
  if (resolvedModule === undefined) return undefined;
  const fileName = resolvedModule.resolvedFileName.replace(/\.d\.ts$/u, ".ts");
  const sourceFile = program.getSourceFile(resolvedModule.resolvedFileName) ?? program.getSourceFile(fileName);
  if (sourceFile === undefined || sourceFile.isDeclarationFile) return undefined;
  const filePath = projectRelativePath(projectPath, sourceFile.fileName);
  return filePath.startsWith("../") ? undefined : filePath;
}

function edgeKey(sourceId, targetId, kind) {
  return `${sourceId}\u0000${targetId}\u0000${kind}`;
}

function edgeOccurrenceKey(sourceId, targetId, kind, line, column) {
  return `${edgeKey(sourceId, targetId, kind)}\u0000${line}\u0000${column}`;
}

function assertion(id, category, source, target, kind, location, evidence) {
  return {
    id,
    category,
    source: { id: source.id, qualifiedName: source.qualifiedName, filePath: source.filePath },
    target: { id: target.id, qualifiedName: target.qualifiedName, filePath: target.filePath },
    kind,
    location,
    evidence
  };
}

function identityAssertion(id, expected, observed) {
  return {
    id,
    category: "identities",
    expected,
    observed: observed === undefined
      ? null
      : {
          id: observed.id,
          qualifiedName: observed.qualifiedName,
          filePath: observed.filePath,
          name: observed.name,
          kind: observed.kind,
          range: observed.range
        },
    evidence: "typescript-compiler-declaration"
  };
}

export function compilerProvenArraySortComparator(checker, node) {
  if (
    !ts.isCallExpression(node) ||
    node.questionDotToken !== undefined ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.questionDotToken !== undefined ||
    node.expression.name.text !== "sort" ||
    node.arguments.length !== 1
  ) {
    return undefined;
  }

  const comparator = node.arguments[0];
  if (!ts.isIdentifier(comparator)) return undefined;

  const sortSymbol = checker.getSymbolAtLocation(node.expression.name);
  const isBuiltInArraySort = sortSymbol?.declarations?.some(
    (declaration) =>
      ts.isMethodSignature(declaration) &&
      ts.isInterfaceDeclaration(declaration.parent) &&
      declaration.parent.name.text === "Array" &&
      declaration.getSourceFile().isDeclarationFile
  ) ?? false;
  return isBuiltInArraySort ? comparator : undefined;
}

function collectCompilerOracle({ program, selectedSourceFiles, graphSymbolsByFile, graphSymbolsById, projectPath }) {
  const checker = program.getTypeChecker();
  const compilerOptions = program.getCompilerOptions();
  const identities = [];
  const moduleEdges = [];
  const callsAndInstantiates = [];
  const signaturesAndHeritage = [];
  const crossLayerAndTestImpact = [];
  const allRelations = new Map();
  const relationOccurrences = [];
  const missingIdentityCandidates = [];
  let sequence = 0;

  const addRelation = (collection, category, source, target, kind, sourceFile, node, evidence) => {
    if (source === undefined || target === undefined) return;
    const location = sourceLocation(sourceFile, node);
    const key = edgeKey(source.id, target.id, kind);
    relationOccurrences.push({ sourceId: source.id, targetId: target.id, kind, location, evidence });
    if (!allRelations.has(key)) {
      allRelations.set(key, { sourceId: source.id, targetId: target.id, kind, location, evidence });
    }
    if (!collection.some((item) => edgeKey(item.source.id, item.target.id, item.kind) === key)) {
      collection.push(assertion(`truth-${String(++sequence).padStart(4, "0")}`, category, source, target, kind, location, evidence));
    }
  };

  for (const sourceFile of selectedSourceFiles) {
    const filePath = projectRelativePath(projectPath, sourceFile.fileName);
    const fileSymbol = fileGraphSymbol(graphSymbolsByFile, filePath);
    const visit = (node) => {
      const nameNode = declarationNameNode(node);
      if (nameNode !== undefined) {
        const kind = declarationGraphKind(node);
        const location = sourceLocation(sourceFile, nameNode);
        const expected = kind === undefined
          ? undefined
          : {
              filePath,
              name: declarationNameText(nameNode, sourceFile),
              kind,
              location
            };
        const graphSymbol = graphSymbolForDeclaration(graphSymbolsByFile, projectPath, node);
        if (expected !== undefined) {
          identities.push(
            identityAssertion(
              `identity-${String(identities.length + 1).padStart(4, "0")}`,
              expected,
              graphSymbol
            )
          );
          if (graphSymbol === undefined) missingIdentityCandidates.push(expected);
        }
        if (graphSymbol !== undefined) {
          if (fileSymbol !== undefined) {
            const key = edgeKey(fileSymbol.id, graphSymbol.id, "contains");
            allRelations.set(key, {
              sourceId: fileSymbol.id,
              targetId: graphSymbol.id,
              kind: "contains",
              location: sourceLocation(sourceFile, nameNode),
              evidence: "typescript-compiler-declaration"
            });
          }
        }
      }

      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
        const targetFilePath = moduleTargetFile(
          program,
          compilerOptions,
          projectPath,
          sourceFile.fileName,
          node.moduleSpecifier.text
        );
        const target = targetFilePath === undefined ? undefined : fileGraphSymbol(graphSymbolsByFile, targetFilePath);
        const kind = ts.isImportDeclaration(node) ? "imports" : "exports";
        addRelation(moduleEdges, "moduleEdges", fileSymbol, target, kind, sourceFile, node.moduleSpecifier, "typescript-module-resolution");
      }

      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expression = node.expression;
        const symbolNode = ts.isPropertyAccessExpression(expression) ? expression.name : expression;
        const target = graphSymbolForCompilerSymbol(checker, graphSymbolsByFile, projectPath, checker.getSymbolAtLocation(symbolNode));
        const source = enclosingSourceGraphSymbol(
          graphSymbolsByFile,
          projectPath,
          node,
          ts.isNewExpression(node)
        );
        const kind = ts.isNewExpression(node) ? "instantiates" : "calls";
        addRelation(callsAndInstantiates, "callsAndInstantiates", source, target, kind, sourceFile, symbolNode, "typescript-type-checker-call-target");

        const comparator = compilerProvenArraySortComparator(checker, node);
        if (comparator !== undefined) {
          const comparatorTarget = graphSymbolForCompilerSymbol(
            checker,
            graphSymbolsByFile,
            projectPath,
            checker.getSymbolAtLocation(comparator)
          );
          addRelation(
            callsAndInstantiates,
            "callsAndInstantiates",
            source,
            comparatorTarget,
            "calls",
            sourceFile,
            comparator,
            "typescript-type-checker-array-sort-comparator"
          );
        }
      }

      if (ts.isHeritageClause(node)) {
        const owner = graphSymbolForDeclaration(graphSymbolsByFile, projectPath, node.parent);
        const kind = node.token === ts.SyntaxKind.ImplementsKeyword ? "implements" : "extends";
        for (const type of node.types) {
          const symbolNode = ts.isExpressionWithTypeArguments(type) ? type.expression : type;
          const target = graphSymbolForCompilerSymbol(checker, graphSymbolsByFile, projectPath, checker.getSymbolAtLocation(symbolNode));
          addRelation(signaturesAndHeritage, "signaturesAndHeritage", owner, target, kind, sourceFile, symbolNode, "typescript-type-checker-heritage-target");
        }
      }

      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isMethodSignature(node) ||
          ts.isConstructorDeclaration(node)) &&
        (ts.isConstructorDeclaration(node) || node.name !== undefined)
      ) {
        const owner = graphSymbolForDeclaration(graphSymbolsByFile, projectPath, node);
        for (const parameter of node.parameters) {
          if (parameter.type === undefined) continue;
          for (const { target, symbolNode } of typeGraphTargets(
            checker,
            graphSymbolsByFile,
            projectPath,
            parameter.type
          )) {
            addRelation(signaturesAndHeritage, "signaturesAndHeritage", owner, target, "accepts", sourceFile, symbolNode, "typescript-type-checker-parameter-type");
          }
        }
        if (node.type !== undefined) {
          for (const { target, symbolNode } of typeGraphTargets(
            checker,
            graphSymbolsByFile,
            projectPath,
            node.type
          )) {
            addRelation(signaturesAndHeritage, "signaturesAndHeritage", owner, target, "returns", sourceFile, symbolNode, "typescript-type-checker-return-type");
          }
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const primaryKeys = new Set([
    ...moduleEdges,
    ...callsAndInstantiates,
    ...signaturesAndHeritage
  ].map((item) => edgeKey(item.source.id, item.target.id, item.kind)));
  const layer = (filePath) => filePath.split("/").slice(0, 2).join("/");
  for (const relation of [...moduleEdges, ...callsAndInstantiates, ...signaturesAndHeritage]) {
    const key = edgeKey(relation.source.id, relation.target.id, relation.kind);
    if (
      relation.source.filePath !== relation.target.filePath &&
      layer(relation.source.filePath) !== layer(relation.target.filePath) &&
      primaryKeys.has(key)
    ) {
      crossLayerAndTestImpact.push({
        ...relation,
        id: `cross-layer-${String(crossLayerAndTestImpact.length + 1).padStart(4, "0")}`,
        category: "crossLayerAndTestImpact"
      });
    }
  }

  const dedupeAndSort = (items) => {
    const byKey = new Map();
    for (const item of items) {
      const key = item.category === "identities"
        ? `${item.expected.filePath}\u0000${item.expected.kind}\u0000${item.expected.name}\u0000${item.expected.location.line}\u0000${item.expected.location.column}`
        : edgeOccurrenceKey(
            item.source.id,
            item.target.id,
            item.kind,
            item.location.line,
            item.location.column
          );
      if (!byKey.has(key)) byKey.set(key, item);
    }
    return [...byKey.values()].sort((left, right) => compareText(left.id, right.id));
  };

  return {
    identities: dedupeAndSort(identities),
    moduleEdges: dedupeAndSort(moduleEdges),
    callsAndInstantiates: dedupeAndSort(callsAndInstantiates),
    signaturesAndHeritage: dedupeAndSort(signaturesAndHeritage),
    crossLayerAndTestImpact: dedupeAndSort(crossLayerAndTestImpact),
    allRelations,
    relationOccurrences,
    missingIdentityCandidates,
    graphSymbolsById
  };
}

function takeRequired(items, count, label, groupKey) {
  if (items.length < count) {
    throw new Error(`${label} has only ${items.length} independently derived truths; ${count} are required.`);
  }
  const groups = new Map();
  for (const item of items) {
    const key = groupKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const orderedGroups = [...groups.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, group]) => group);
  const selected = [];
  for (let offset = 0; selected.length < count; offset += 1) {
    let added = false;
    for (const group of orderedGroups) {
      const item = group[offset];
      if (item === undefined) continue;
      selected.push(item);
      added = true;
      if (selected.length === count) break;
    }
    if (!added) break;
  }
  if (selected.length < count) {
    throw new Error(`${label} balanced selection produced only ${selected.length} truths; ${count} are required.`);
  }
  return selected;
}

function buildPositiveTruths(oracle) {
  return Object.fromEntries(
    Object.entries(EXPECTED_POSITIVE_SLICES).map(([category, count]) => [
      category,
      takeRequired(
        oracle[category],
        count,
        category,
        (item) => item.category === "identities" ? item.expected.filePath : item.source.filePath
      )
    ])
  );
}

function graphHasTruth(graphSymbolsById, exactEdgeKeys, exactOccurrenceKeys, truth) {
  if (truth.category === "identities") {
    return truth.observed !== null && graphSymbolsById.has(truth.observed.id);
  }
  if (truth.kind === "calls" || truth.kind === "instantiates") {
    return exactOccurrenceKeys.has(
      edgeOccurrenceKey(
        truth.source.id,
        truth.target.id,
        truth.kind,
        truth.location.line,
        truth.location.column
      )
    );
  }
  return exactEdgeKeys.has(edgeKey(truth.source.id, truth.target.id, truth.kind));
}

function buildNegativeAssertions(positiveTruths, graphSymbolsById, allRelations) {
  const symbols = [...graphSymbolsById.values()]
    .filter((symbol) => symbol.kind !== "file")
    .sort((left, right) => compareText(left.id, right.id));
  const negatives = [];
  const seen = new Set();
  for (const truth of Object.values(positiveTruths).flat()) {
    if (truth.source === undefined) continue;
    for (const alternative of symbols) {
      if (
        alternative.id === truth.target.id ||
        alternative.kind !== graphSymbolsById.get(truth.target.id)?.kind
      ) {
        continue;
      }
      const key = edgeKey(truth.source.id, alternative.id, truth.kind);
      if (seen.has(key) || allRelations.has(key)) continue;
      seen.add(key);
      negatives.push({
        id: `negative-${String(negatives.length + 1).padStart(4, "0")}`,
        source: truth.source,
        forbiddenTarget: {
          id: alternative.id,
          qualifiedName: alternative.qualifiedName,
          filePath: alternative.filePath
        },
        kind: truth.kind,
        rationale: "compiler oracle has no direct relation to this same-kind alternative"
      });
      break;
    }
    if (negatives.length === EXPECTED_NEGATIVE_ASSERTIONS) break;
  }
  if (negatives.length < EXPECTED_NEGATIVE_ASSERTIONS) {
    throw new Error(`Only ${negatives.length} negative assertions could be constructed.`);
  }
  return negatives;
}

async function selectedFileEvidence(projectPath, indexedFilesByPath) {
  return Promise.all(
    SELECTED_FILES.map(async (filePath) => {
      const content = await readFile(resolve(projectPath, filePath));
      const liveSha256 = sha256(content);
      const indexedSha256 = indexedFilesByPath.get(filePath)?.contentHash?.toUpperCase() ?? null;
      if (indexedSha256 !== liveSha256) {
        throw new Error(
          `Selected source drift for ${filePath}: live ${liveSha256}, indexed ${indexedSha256 ?? "missing"}.`
        );
      }
      return {
        filePath,
        sha256: liveSha256,
        indexedSha256,
        indexMatches: true,
        bytes: content.length
      };
    })
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const projectPath = resolve(options.projectPath);
  const configuration = compilerConfiguration(projectPath);
  const explicitSelectedRoots = SELECTED_FILES.map((filePath) => resolve(projectPath, filePath));
  const program = ts.createProgram({
    rootNames: [...new Set([...configuration.fileNames, ...explicitSelectedRoots])],
    options: configuration.options
  });
  const syntacticDiagnostics = program.getSyntacticDiagnostics();
  if (syntacticDiagnostics.length > 0) {
    throw new Error(
      syntacticDiagnostics
        .slice(0, 20)
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
        .join("\n")
    );
  }
  const semanticDiagnostics = program.getSemanticDiagnostics();

  const selectedSet = new Set(SELECTED_FILES);
  const selectedSourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => selectedSet.has(projectRelativePath(projectPath, sourceFile.fileName)))
    .sort((left, right) => compareText(left.fileName, right.fileName));
  if (selectedSourceFiles.length !== SELECTED_FILES.length) {
    const found = new Set(selectedSourceFiles.map((sourceFile) => projectRelativePath(projectPath, sourceFile.fileName)));
    const missing = SELECTED_FILES.filter((filePath) => !found.has(filePath));
    throw new Error(`Selected TypeScript files missing from compiler program: ${missing.join(", ")}`);
  }

  const bundle = new SqliteGraphStore().getActiveGenerationBundle(projectPath);
  const indexedFilesByPath = new Map(bundle.snapshot.files.map((file) => [file.path, file]));
  const graphSymbolsByFile = new Map();
  const graphSymbolsById = new Map(bundle.snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  for (const symbol of bundle.snapshot.symbols) {
    const existing = graphSymbolsByFile.get(symbol.filePath) ?? [];
    existing.push(symbol);
    graphSymbolsByFile.set(symbol.filePath, existing);
  }
  const exactEdges = bundle.snapshot.edges.filter(
    (edge) => edge.resolution === "exact" && edge.targetId !== null
  );
  const exactEdgeKeys = new Set(exactEdges.map((edge) => edgeKey(edge.sourceId, edge.targetId, edge.kind)));
  const exactOccurrenceKeys = new Set(
    exactEdges.map((edge) =>
      edgeOccurrenceKey(
        edge.sourceId,
        edge.targetId,
        edge.kind,
        edge.range.start.line,
        edge.range.start.column
      )
    )
  );

  const oracle = collectCompilerOracle({
    program,
    selectedSourceFiles,
    graphSymbolsByFile,
    graphSymbolsById,
    projectPath
  });
  const positiveTruths = buildPositiveTruths(oracle);
  const negativeAssertions = buildNegativeAssertions(positiveTruths, graphSymbolsById, oracle.allRelations);
  const flatPositiveTruths = Object.values(positiveTruths).flat();
  const tp = flatPositiveTruths.filter((truth) =>
    graphHasTruth(graphSymbolsById, exactEdgeKeys, exactOccurrenceKeys, truth)
  );
  const fn = flatPositiveTruths.filter((truth) =>
    !graphHasTruth(graphSymbolsById, exactEdgeKeys, exactOccurrenceKeys, truth)
  );
  const negativeFalsePositives = negativeAssertions.filter((negative) =>
    exactEdgeKeys.has(edgeKey(negative.source.id, negative.forbiddenTarget.id, negative.kind))
  );

  const selectedExactEdges = exactEdges.filter((edge) => selectedSet.has(edge.filePath));
  const compilerOccurrenceKeys = new Set(
    oracle.relationOccurrences.map((occurrence) =>
      edgeOccurrenceKey(
        occurrence.sourceId,
        occurrence.targetId,
        occurrence.kind,
        occurrence.location.line,
        occurrence.location.column
      )
    )
  );
  const initiallyUnauditedExactEdges = selectedExactEdges.filter((edge) => {
    if (edge.kind === "contains") {
      const target = graphSymbolsById.get(edge.targetId);
      return target === undefined || target.filePath !== edge.filePath;
    }
    if (edge.kind === "calls" || edge.kind === "instantiates") {
      return !compilerOccurrenceKeys.has(
        edgeOccurrenceKey(
          edge.sourceId,
          edge.targetId,
          edge.kind,
          edge.range.start.line,
          edge.range.start.column
        )
      );
    }
    return !oracle.allRelations.has(edgeKey(edge.sourceId, edge.targetId, edge.kind));
  });
  const wrongSourceExactEdges = initiallyUnauditedExactEdges.filter((edge) =>
    oracle.relationOccurrences.some(
      (occurrence) =>
        occurrence.targetId === edge.targetId &&
        occurrence.kind === edge.kind &&
        occurrence.location.line === edge.range.start.line &&
        occurrence.location.column === edge.range.start.column &&
        occurrence.sourceId !== edge.sourceId
    )
  );
  const wrongSourceIds = new Set(wrongSourceExactEdges.map((edge) => edge.id));
  const unexpectedCallExactEdges = initiallyUnauditedExactEdges.filter(
    (edge) =>
      !wrongSourceIds.has(edge.id) &&
      (edge.kind === "calls" || edge.kind === "instantiates")
  );
  const unexpectedCallIds = new Set(unexpectedCallExactEdges.map((edge) => edge.id));
  const unauditedExactEdges = initiallyUnauditedExactEdges.filter(
    (edge) => !wrongSourceIds.has(edge.id) && !unexpectedCallIds.has(edge.id)
  );
  const fp = [
    ...negativeFalsePositives.map((assertion_) => ({ type: "negative-assertion", assertion: assertion_ })),
    ...wrongSourceExactEdges.map((edge) => ({
      type: "wrong-source-exact-edge",
      edge: {
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        kind: edge.kind,
        filePath: edge.filePath,
        range: edge.range,
        referenceName: edge.referenceName,
        ruleId: edge.evidence?.ruleId ?? null
      },
      compilerOccurrences: oracle.relationOccurrences.filter(
        (occurrence) =>
          occurrence.targetId === edge.targetId &&
          occurrence.kind === edge.kind &&
          occurrence.location.line === edge.range.start.line &&
          occurrence.location.column === edge.range.start.column
      )
    })),
    ...unexpectedCallExactEdges.map((edge) => ({
      type: "non-call-expression-exact-edge",
      edge: {
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        kind: edge.kind,
        filePath: edge.filePath,
        range: edge.range,
        referenceName: edge.referenceName,
        ruleId: edge.evidence?.ruleId ?? null
      }
    }))
  ];

  const precision = tp.length + fp.length === 0 ? 1 : tp.length / (tp.length + fp.length);
  const recall = tp.length + fn.length === 0 ? 1 : tp.length / (tp.length + fn.length);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const safeProjectPath = projectPath.split(sep).join("/");
  const actualCommit = execFileSync("git", ["-c", `safe.directory=${safeProjectPath}`, "rev-parse", "HEAD"], {
    cwd: projectPath,
    encoding: "utf8"
  }).trim();
  const scoreByCategory = Object.fromEntries(
    Object.entries(positiveTruths).map(([category, truths]) => {
      const categoryTp = truths.filter((truth) =>
        graphHasTruth(graphSymbolsById, exactEdgeKeys, exactOccurrenceKeys, truth)
      ).length;
      return [category, { total: truths.length, tp: categoryTp, fn: truths.length - categoryTp }];
    })
  );
  const result = {
    schemaVersion: 1,
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: new Date().toISOString(),
    baseline: {
      expectedCommit: BASELINE_COMMIT,
      actualCommit,
      commitMatches: actualCommit === BASELINE_COMMIT,
      packageVersion: "0.419.0",
      generationId: bundle.status.generationId,
      indexedAt: bundle.status.indexedAt,
      extractorVersion: bundle.extractorVersion,
      resolverVersion: bundle.resolverVersion
    },
    contract: {
      mode: options.mode,
      selectedFiles: SELECTED_FILES.length,
      positiveSlices: EXPECTED_POSITIVE_SLICES,
      positiveGroundTruth: flatPositiveTruths.length,
      negativeAssertions: negativeAssertions.length,
      productionExtractorChangesAllowed: options.mode === "postfix"
    },
    compilerDiagnostics: {
      syntactic: syntacticDiagnostics.length,
      semantic: semanticDiagnostics.length,
      semanticSamples: semanticDiagnostics.slice(0, 10).map((diagnostic) => ({
        code: diagnostic.code,
        filePath: diagnostic.file === undefined
          ? null
          : projectRelativePath(projectPath, diagnostic.file.fileName),
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      }))
    },
    selectedFiles: await selectedFileEvidence(projectPath, indexedFilesByPath),
    oracleInventory: {
      identities: oracle.identities.length,
      missingIdentityCandidates: oracle.missingIdentityCandidates.length,
      moduleEdges: oracle.moduleEdges.length,
      callsAndInstantiates: oracle.callsAndInstantiates.length,
      signaturesAndHeritage: oracle.signaturesAndHeritage.length,
      crossLayerAndTestImpact: oracle.crossLayerAndTestImpact.length
    },
    positiveTruths,
    negativeAssertions,
    score: {
      tp: tp.length,
      fp: fp.length,
      fn: fn.length,
      precision,
      recall,
      f1,
      byCategory: scoreByCategory,
      negativeAssertions: {
        total: negativeAssertions.length,
        passed: negativeAssertions.length - negativeFalsePositives.length,
        failed: negativeFalsePositives.length
      }
    },
    failures: {
      falseNegatives: fn,
      falsePositives: fp,
      unauditedExactEdges: unauditedExactEdges.map((edge) => ({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        kind: edge.kind,
        filePath: edge.filePath,
        range: edge.range,
        referenceName: edge.referenceName,
        ruleId: edge.evidence?.ruleId ?? null
      }))
    },
    audit: {
      selectedExactEdges: selectedExactEdges.length,
      independentlyValidatedExactEdges:
        selectedExactEdges.length -
        unauditedExactEdges.length -
        wrongSourceExactEdges.length -
        unexpectedCallExactEdges.length,
      confirmedWrongSourceExactEdges: wrongSourceExactEdges.length,
      confirmedNonCallExpressionExactEdges: unexpectedCallExactEdges.length,
      unauditedExactEdges: unauditedExactEdges.length,
      complete: unauditedExactEdges.length === 0
    }
  };

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output === undefined) {
    process.stdout.write(serialized);
  } else {
    await writeFile(options.output, serialized, "utf8");
    process.stdout.write(
      `${JSON.stringify({ output: options.output, score: result.score, audit: result.audit, oracleInventory: result.oracleInventory }, null, 2)}\n`
    );
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
