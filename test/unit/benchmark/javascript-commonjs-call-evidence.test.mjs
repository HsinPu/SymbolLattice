import { describe, expect, it } from "vitest";
import { parseCommonJsSource, verifyCommonJsReceipt } from "../../../benchmarks/javascript/commonjs-call-evidence.mjs";

const consumer = "'use strict'; const { handle: run } = require('./provider');\nfunction start() { run(); }";
const provider = "'use strict'; function handle() {}\nmodule.exports = { handle };";
const range = (text, snippet) => {
  const start = text.indexOf(snippet);
  const point = (offset) => { const lines = text.slice(0, offset).split("\n"); return { line: lines.length, column: lines.at(-1).length + 1 }; };
  return { start: point(start), end: point(start + snippet.length) };
};
function fixture() {
  const target = { id: "handle", name: "handle", filePath: "provider.js", range: range(provider, "function handle() {}") };
  const edge = { kind: "calls", resolution: "exact", targetId: target.id, referenceName: "run", filePath: "consumer.js",
    range: { start: { line: 2, column: 20 }, end: { line: 2, column: 23 } },
    evidence: { resolutionPath: ["consumer.js", "provider.js"], candidateSymbolIds: [target.id], commonJsBinding: {
      policy: "javascript-commonjs-object-call-v1", localName: "run", importedName: "handle", moduleSpecifier: "./provider",
      importSite: { filePath: "consumer.js", range: range(consumer, "{ handle: run } = require('./provider')") },
      exportSite: { filePath: "provider.js", range: { start: { line: 2, column: 20 }, end: { line: 2, column: 26 } } }
    } } };
  const sourceFor = (file) => parseCommonJsSource(file === "consumer.js" ? consumer : provider);
  return { edge, target, sourceFor };
}

describe("independent CommonJS import/export/call source receipts", () => {
  it("accepts matching literal AST receipts with a renamed import", () => {
    const { edge, target, sourceFor } = fixture();
    expect(verifyCommonJsReceipt(edge, target, sourceFor)).toBe(true);
  });

  it.each([
    ["call range", (edge) => { edge.range.start.column += 1; }],
    ["import range", (edge) => { edge.evidence.commonJsBinding.importSite.range.end.column += 1; }],
    ["export range", (edge) => { edge.evidence.commonJsBinding.exportSite.range.start.line += 1; }],
    ["local name", (edge) => { edge.evidence.commonJsBinding.localName = "other"; }],
    ["export name", (edge) => { edge.evidence.commonJsBinding.importedName = "other"; }],
    ["specifier", (edge) => { edge.evidence.commonJsBinding.moduleSpecifier = "./other"; }],
    ["import path", (edge) => { edge.evidence.commonJsBinding.importSite.filePath = "other.js"; }],
    ["export path", (edge) => { edge.evidence.commonJsBinding.exportSite.filePath = "other.js"; }],
    ["target name", (_edge, target) => { target.name = "other"; }],
    ["target range", (_edge, target) => { target.range.start.column += 1; }],
    ["candidate", (edge) => { edge.evidence.candidateSymbolIds = ["other"]; }],
    ["target with identical source in another file", (edge, target) => {
      target.filePath = "other.js";
      edge.evidence.commonJsBinding.exportSite.filePath = "other.js";
      edge.evidence.resolutionPath[1] = "other.js";
    }]
  ])("rejects a mismatching %s", (_label, mutate) => {
    const { edge, target, sourceFor } = fixture();
    mutate(edge, target);
    expect(() => verifyCommonJsReceipt(edge, target, sourceFor)).toThrow();
  });
});
