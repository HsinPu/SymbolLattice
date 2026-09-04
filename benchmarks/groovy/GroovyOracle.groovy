import groovy.json.JsonOutput
import org.codehaus.groovy.ast.CodeVisitorSupport
import org.codehaus.groovy.ast.expr.BinaryExpression
import org.codehaus.groovy.ast.expr.ClosureExpression
import org.codehaus.groovy.ast.expr.DeclarationExpression
import org.codehaus.groovy.ast.expr.MethodCallExpression
import org.codehaus.groovy.ast.expr.VariableExpression
import org.codehaus.groovy.control.SourceUnit

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

if (args.length < 1 || args.length > 2 || (args.length == 2 && !(args[1] in ['self', 'inter']))) {
  System.err.println('usage: GroovyOracle.groovy <root> [self|inter]')
  System.exit(2)
}

def root = Path.of(args[0]).toAbsolutePath().normalize()
def mode = args.length == 2 ? args[1] : 'self'
def facts = []
def rejected = []

Files.walk(root).withCloseable { stream ->
  stream.filter { Files.isRegularFile(it) && it.fileName.toString().endsWith('.groovy') }
    .sorted()
    .forEach { path ->
      def relative = root.relativize(path).toString().replace('\\', '/')
      def source = Files.readString(path, StandardCharsets.UTF_8)
      try {
        def unit = SourceUnit.create(relative, source)
        unit.parse()
        unit.completePhase()
        unit.nextPhase()
        unit.convert()
        def module = unit.AST
        def script = module.classes.find { it.script }
        if (script == null || source.contains('.metaClass')) return
        def sourceLines = source.readLines()
        def methods = script.methods.findAll { method ->
          def declarationLine = method.lineNumber > 0 && method.lineNumber <= sourceLines.size()
            ? sourceLines[method.lineNumber - 1]
            : ''
          def methodText = method.lineNumber > 0 && method.lastLineNumber >= method.lineNumber
            ? sourceLines.subList(method.lineNumber - 1, Math.min(method.lastLineNumber, sourceLines.size())).join('\n')
            : ''
          !method.synthetic &&
            method.lineNumber > 0 &&
            method.name != 'main' &&
            method.name != 'run' &&
            declarationLine.substring(Math.max(0, method.columnNumber - 1)).startsWith('def ') &&
            methodText.count('{') == 1
        }
        def dynamicHookNames = ['methodMissing', 'propertyMissing', 'invokeMethod', 'getProperty', 'setProperty'] as Set
        if (mode == 'inter' && methods.any { dynamicHookNames.contains(it.name) }) return
        def uniqueByName = methods.groupBy { it.name }.findAll { name, matches -> matches.size() == 1 }
        def staticImportNames = (module.staticImports?.keySet() ?: []) as Set
        def directImportNames = (module.imports?.collect { it.alias ?: it.type?.nameWithoutPackage } ?: []) as Set
        def bindingAssignments = [] as Set
        module.statementBlock?.visit(new CodeVisitorSupport() {
          @Override
          void visitDeclarationExpression(DeclarationExpression expression) {
            if (expression.variableExpression != null) bindingAssignments << expression.variableExpression.name
            super.visitDeclarationExpression(expression)
          }

          @Override
          void visitBinaryExpression(BinaryExpression expression) {
            if (expression.operation?.text in ['=', '+=', '-=', '*=', '/=', '%='] &&
              expression.leftExpression instanceof VariableExpression) {
              bindingAssignments << expression.leftExpression.name
            }
            super.visitBinaryExpression(expression)
          }
        })
        methods.each { caller ->
          def shadows = (caller.parameters*.name ?: []) as Set
          def calls = []
          def closureDepth = 0
          caller.code?.visit(new CodeVisitorSupport() {
            @Override
            void visitClosureExpression(ClosureExpression expression) {
              closureDepth++
              super.visitClosureExpression(expression)
              closureDepth--
            }

            @Override
            void visitDeclarationExpression(DeclarationExpression expression) {
              if (expression.variableExpression != null) shadows << expression.variableExpression.name
              super.visitDeclarationExpression(expression)
            }

            @Override
            void visitBinaryExpression(BinaryExpression expression) {
              if (expression.operation?.text in ['=', '+=', '-=', '*=', '/=', '%='] &&
                expression.leftExpression instanceof VariableExpression) {
                shadows << expression.leftExpression.name
              }
              super.visitBinaryExpression(expression)
            }

            @Override
            void visitMethodCallExpression(MethodCallExpression call) {
              def name = call.methodAsString
              def arguments = call.arguments?.expressions
              if (
                closureDepth == 0 &&
                call.implicitThis &&
                name != null &&
                arguments != null &&
                (mode == 'self' ? name == caller.name : name != caller.name) &&
                uniqueByName.containsKey(name) &&
                !staticImportNames.contains(name) &&
                !directImportNames.contains(name) &&
                !bindingAssignments.contains(name) &&
                call.lineNumber > 0 &&
                call.columnNumber > 0
              ) {
                def target = uniqueByName[name][0]
                if (target.parameters.size() == arguments.size()) {
                  calls << [
                    source: caller.name,
                    target: target.name,
                    arity: arguments.size(),
                    line: call.lineNumber,
                    column: call.columnNumber,
                    lastLine: call.lastLineNumber,
                    lastColumn: call.lastColumnNumber
                  ]
                }
              }
              super.visitMethodCallExpression(call)
            }
          })
          calls.findAll { !shadows.contains(it.target) }.each { call ->
            facts << [
              filePath: relative,
              callerLine: caller.lineNumber,
              targetLine: uniqueByName[call.target][0].lineNumber
            ] + call
          }
        }
      } catch (Throwable error) {
        rejected << [filePath: relative, error: error.class.simpleName]
      }
    }
}

def digest = MessageDigest.getInstance('SHA-256')
facts.sort { left, right ->
  (left.filePath <=> right.filePath) ?:
    (left.line <=> right.line) ?:
    (left.column <=> right.column) ?:
    (left.source <=> right.source) ?:
    (left.target <=> right.target)
}.each { fact ->
  digest.update(JsonOutput.toJson(fact).getBytes(StandardCharsets.UTF_8))
  digest.update((byte) 10)
}

println JsonOutput.toJson([
  schemaVersion: 1,
  mode: mode,
  root: root.toString(),
  candidates: facts,
  rejected: rejected,
  candidateSha256: digest.digest().encodeHex().toString()
])
