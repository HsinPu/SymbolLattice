import { expect, it } from "vitest";
import { verifyCallSourceContexts, verifyLexicalMatches } from "../../benchmarks/mcp/task-retrieval.mjs";

function fixture() {
  const sources = {
    "app.py": "from pkg.base import Base\nclass App(Base):\n    def handle_error(self, error):\n        return self.select_handler(error)\n",
    "pkg/base.py": "class Base:\n    def select_handler(self, error):\n        return error\n",
    "pkg/__init__.py": ""
  };
  const symbol = (id, name, filePath, kind, first, last) => ({ id, name, filePath, kind, qualifiedName: `${filePath}#${name}`,
    range: { start: { line: first, column: kind === "method" ? 5 : 1 },
      end: { line: last, column: sources[filePath].split("\n")[last - 1].length + 1 } } });
  const root = symbol("root", "handle_error", "app.py", "method", 3, 4);
  const declaration = symbol("decl", "select_handler", "pkg/base.py", "method", 2, 3);
  const callerClass = symbol("app", "App", "app.py", "class", 2, 4), declarationClass = symbol("base", "Base", "pkg/base.py", "class", 1, 3);
  const edge = (id, kind, sourceId, targetId, filePath, range) => ({ id, kind, sourceId, targetId, filePath, range, confidence: 1, resolution: "exact" });
  const row = (path, line, column = 1) => ({ start: { line, column }, end: { line, column: sources[path].split("\n")[line - 1].length + 1 } });
  const path = [root.filePath, declaration.filePath], configurationPaths = ["pkg/__init__.py"];
  const call = { ...edge("call", "calls", root.id, null, root.filePath, row(root.filePath, 4, 16)), confidence: 0, resolution: "unresolved",
    referenceName: "self.select_handler", evidence: { stage: "syntax", ruleId: "syntax.python.member-call.unknown-receiver" } };
  const inheritedSource = { callerClass, declarationClass,
    callerContainment: edge("caller-contains", "contains", callerClass.id, root.id, root.filePath, root.range),
    declarationContainment: edge("declaration-contains", "contains", declarationClass.id, declaration.id, declaration.filePath, declaration.range),
    inheritance: { ...edge("extends", "extends", callerClass.id, declarationClass.id, root.filePath, row(root.filePath, 2)), referenceName: "Base",
      evidence: { stage: "module", ruleId: "module.python.regular-package.absolute-named-import.unique-top-level-class-inheritance", resolutionPath: path, configurationPaths } },
    importEdge: { ...edge("import", "imports", "app-file", "base-file", root.filePath, row(root.filePath, 1)), referenceName: "pkg.base",
      evidence: { stage: "module", ruleId: "module.python.regular-package.absolute-named-base-import", resolutionPath: path, configurationPaths } }
  };
  const token = (term, word) => {
    const line = sources[declaration.filePath].split("\n")[1], column = line.indexOf(word) + 1;
    return { term, token: word, filePath: declaration.filePath, range: { start: { line: 2, column }, end: { line: 2, column: column + word.length } } };
  };
  const result = { queryPlan: { query: "How is an error handler chosen?" },
    focuses: [{ rank: 1, symbol: root, sourceRole: { role: "production" }, generated: { generated: false } }],
    sourceWindowPlan: { callSourceContextSearch: { policy: "written-python-call-source-context-v1", scope: "inspected-bounded-graph",
      queryTerms: ["error", "handler"], candidateCount: 1, sourceCharacters: 63, selectedCount: 1 } },
    sourceWindows: [{ focusRank: 1, filePath: declaration.filePath, startLine: 2, endLine: 3, reason: "inherited-call-source",
      connectionEdgeIds: [], relatedSymbolIds: [declaration.id], pathSpineIndexes: [], sourceMatches: [token("handler", "select_handler"), token("error", "error")],
      callSourceContext: { reason: "inherited-call-source", focusRank: 1, root, declaration, steps: [{ caller: root, declaration, call, inheritedSource }] } }] };
  const read = file => { if (!(file in sources)) throw Error("Missing fixture source"); return sources[file]; };
  return { result, read };
}

it("checks source steps and original token spans without upgrading a call to a target", () => {
  const f = fixture();
  expect(verifyCallSourceContexts(f.result, f.read)).toEqual({ verifiedWindows: 1, verifiedBaseSteps: 1, verifiedCallers: 0 });
  expect(verifyLexicalMatches(f.result, f.read)).toEqual({ verifiedMatches: 2 });
});

it("rejects guessed targets, broken ownership, mixed imports and borrowed tokens", () => {
  for (const tamper of [
    result => { result.sourceWindows[0].callSourceContext.steps[0].call.targetId = "decl"; },
    result => { result.sourceWindows[0].callSourceContext.steps[0].call.referenceName = "other.select_handler"; },
    result => { result.sourceWindows[0].callSourceContext.steps[0].inheritedSource.callerContainment.sourceId = "other"; },
    result => { result.sourceWindows[0].callSourceContext.steps[0].inheritedSource.importEdge.evidence.resolutionPath.reverse(); },
    result => { result.sourceWindows[0].callSourceContext.steps[0].inheritedSource.importEdge.evidence.ruleId = "module.python.regular-package.relative-named-import"; },
    result => { result.sourceWindowPlan.callSourceContextSearch.queryTerms.push("invented"); },
    result => { result.sourceWindows[0].sourceMatches[0].token = "handler"; }
  ]) {
    const f = fixture(), result = structuredClone(f.result); tamper(result);
    expect(() => verifyLexicalMatches(result, f.read)).toThrow();
  }
});
