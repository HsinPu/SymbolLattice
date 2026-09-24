import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { resolveProjectFacts } from "../../../src/application/resolution.js";

function graph(files: Record<string, string>) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath, absolutePath: `C:/project/${relativePath}`, language: "javascript" as const,
    sourceText, contentHash: "fixture"
  }));
  const extractedFiles = sourceDocuments.map((file) => extractFileFacts({ ...file, filePath: file.relativePath }));
  return resolveProjectFacts({ sourceDocuments, extractedFiles, indexedAt: "2026-09-18T00:00:00Z" });
}
const provider = "'use strict'; function handle() {}\nmodule.exports = { handle };";
const consumer = "'use strict'; const { handle: run } = require('./provider');\nfunction start() { run(); }";
const exactCommonJs = (result: ReturnType<typeof graph>) => result.edges.filter((edge) => edge.evidence?.ruleId === "module.commonjs-object-call");

describe("source-proven CommonJS object calls", () => {
  it("resolves a renamed destructured binding with import, export and call source receipts", () => {
    const result = graph({ "provider.js": provider, "consumer.js": consumer });
    expect(exactCommonJs(result)).toEqual([expect.objectContaining({
      kind: "calls", resolution: "exact", filePath: "consumer.js", referenceName: "run",
      range: { start: { line: 2, column: 20 }, end: { line: 2, column: 23 } },
      evidence: expect.objectContaining({ resolutionPath: ["consumer.js", "provider.js"], commonJsBinding: {
        policy: "javascript-commonjs-object-call-v1", localName: "run", importedName: "handle", moduleSpecifier: "./provider",
        importSite: { filePath: "consumer.js", range: { start: { line: 1, column: 21 }, end: { line: 1, column: 60 } } },
        exportSite: { filePath: "provider.js", range: { start: { line: 2, column: 20 }, end: { line: 2, column: 26 } } }
      } })
    })]);
    const edge = exactCommonJs(result)[0]!;
    expect(result.symbols.find((symbol) => symbol.id === edge.targetId)?.name).toBe("handle");
    expect(result.symbols.find((symbol) => symbol.id === edge.targetId)?.isExported).toBe(true);
    expect(result.symbols.find((symbol) => symbol.id === edge.sourceId)?.name).toBe("start");
  });

  it("supports cjs, string export aliases and const function targets", () => {
    const result = graph({
      "provider.cjs": "const local = () => 1; module.exports = { 'handle': local, other() {} };",
      "consumer.cjs": "const { 'handle': run } = require('./provider.cjs'); run();"
    });
    expect(exactCommonJs(result)).toHaveLength(1);
  });

  it.each([
    ["parameter", "function start(run) { run(); }"],
    ["destructured parameter", "function start({ run }) { run(); }"],
    ["catch binding", "try {} catch (run) { run(); }"],
    ["private function name", "consume(function run() { run(); });"],
    ["local variable", "function start() { const run = () => {}; run(); }"],
    ["reassignment", "run = other; run();"],
    ["destructuring assignment", "({ run } = other); run();"],
    ["array assignment", "[run] = other; run();"],
    ["loop assignment", "for (run of items) {} run();"],
    ["eval", "eval('run = other'); run();"]
  ])("does not turn %s into an imported call", (_label, body) => {
    const result = graph({ "provider.js": provider,
      "consumer.js": `'use strict'; const { handle: run } = require('./provider'); ${body}` });
    expect(exactCommonJs(result)).toEqual([]);
  });

  it.each([
    "module.exports = { handle }; module.exports = other;",
    "if (enabled) module.exports = { handle };",
    "module.exports = { handle }; module.exports.handle = other;",
    "module.exports = { handle }; exports.handle = other;",
    "module.exports = { handle }; const alias = module.exports;",
    "module.exports = { handle, ...other };",
    "module.exports = { handle, [key]: other };",
    "module.exports = { handle, handle: other };",
    "module.exports = { get handle() { return other; } };",
    "module.exports = { handle, get trigger() { this.handle = other; } };",
    "module.exports = { handle }; handle = other;",
    "module.exports = { handle }; [handle] = other;",
    "module.exports = { handle }; Object.defineProperty(module, 'exports', { value: other });",
    "module.exports = { handle }; eval('handle = other');",
    "const module = {}; module.exports = { handle };"
  ])("rejects unstable or dynamic exports: %s", (body) => {
    expect(exactCommonJs(graph({ "provider.js": `'use strict'; function handle() {} ${body}`, "consumer.js": consumer }))).toEqual([]);
  });

  it.each([
    "require('./provider').handle = other;",
    "const mod = require('./provider'); mod.handle = other;",
    "const mod = require('./provider'); ({ fn: mod.handle } = other);",
    "const mod = require('./provider'); [mod.handle] = other;",
    "const mod = require('./provider'); const alias = mod.valueOf(); alias.handle = other;",
    "const mod = require('./provider'); const alias = ((mod.valueOf))(); alias.handle = other;",
    "const mod = require('./provider'); (mod.__defineGetter__)('handle', () => other);",
    "require('./provider').__defineGetter__('handle', () => other);",
    "const mod = require('./provider'); Object.assign(mod, { handle: other });",
    "const mod = require('./provider'); pass(mod);",
    "Object.defineProperty(require('./provider'), 'handle', { value: other });",
    "delete require('./provider').handle;"
  ])("suppresses targets whose module object is mutated or escapes elsewhere: %s", (body) => {
    const result = graph({ "provider.js": provider, "consumer.js": consumer, "mutator.js": `'use strict'; ${body}` });
    expect(exactCommonJs(result)).toEqual([]);
  });

  it("retains bindings when other consumers only read module members", () => {
    const result = graph({ "provider.js": provider, "consumer.js": consumer,
      "reader.js": "'use strict'; const mod = require('./provider'); const fn = mod.handle; fn();" });
    expect(exactCommonJs(result)).toHaveLength(1);
  });

  it.each(["mod.handle();", "((mod.handle))();", "mod['handle']();", "mod.handle`text`;"])("retains bindings when a member call cannot observe its receiver: %s", (call) => {
    const result = graph({ "provider.js": provider, "consumer.js": consumer,
      "reader.js": `'use strict'; const mod = require('./provider'); ${call}` });
    expect(exactCommonJs(result)).toHaveLength(1);
  });

  it.each([
    "this.handle = other;", "return this;", "const get = () => this; pass(get);",
    "eval('this.handle = other');"
  ])("suppresses member calls that can mutate or expose the receiver: %s", (body) => {
    const result = graph({ "provider.js": `'use strict'; function handle() { ${body} } module.exports = { handle };`,
      "consumer.js": consumer, "reader.js": "'use strict'; const mod = require('./provider'); (mod.handle)();" });
    expect(exactCommonJs(result)).toEqual([]);
  });

  it.each(["require('./provider').handle = other;", "eval(code); require('./provider').handle = other;"])("observes mutations in non-strict files too: %s", (body) => {
    expect(exactCommonJs(graph({ "provider.js": provider, "consumer.js": consumer, "mutator.js": body }))).toEqual([]);
  });

  it("rejects cycles and preserves ordinary import-file evidence", () => {
    const result = graph({ "provider.js": `'use strict'; const consumer = require('./consumer'); function handle() {} module.exports = { handle };`, "consumer.js": consumer });
    expect(exactCommonJs(result)).toEqual([]);
    expect(result.edges.some((edge) => edge.kind === "imports" && edge.resolution === "exact")).toBe(true);
  });

  it("detects a cycle through a side-effect-only require", () => {
    const result = graph({ "provider.js": `'use strict'; require('./consumer'); function handle() {} module.exports = { handle };`, "consumer.js": consumer });
    expect(exactCommonJs(result)).toEqual([]);
    expect(result.edges).toContainEqual(expect.objectContaining({ referenceName: "run", resolution: "unresolved",
      evidence: expect.objectContaining({ ruleId: "module.commonjs-object-call.cycle" }) }));
  });

  it.each([
    "let { handle: run } = require('./provider'); run();",
    "const { handle: run = other } = require('./provider'); run();",
    "const { handle: run } = require(variable); run();",
    "const { handle: run } = require('./provider'); require = other; run();",
    "function require() {}; const { handle: run } = require('./provider'); run();",
    "export const marker = 1; const { handle: run } = require('./provider'); run();"
  ])("rejects unsupported importer shapes: %s", (body) => {
    expect(exactCommonJs(graph({ "provider.js": provider, "consumer.js": `'use strict'; ${body}` }))).toEqual([]);
  });

  it("does not interpret mjs require calls as CommonJS", () => {
    expect(exactCommonJs(graph({ "provider.js": provider, "consumer.mjs": consumer }))).toEqual([]);
  });

  it("does not resolve an imported name through a with dynamic scope", () => {
    const result = graph({ "provider.cjs": "function handle() {} module.exports = { handle };",
      "consumer.cjs": "const { handle: run } = require('./provider.cjs'); const other = { run() {} }; with (other) { run(); }" });
    expect(exactCommonJs(result)).toEqual([]);
  });

  it("does not infer Node ESM named-import interop from an object export", () => {
    const result = graph({ "provider.js": provider, "consumer.mjs": "import { handle } from './provider.js'; handle();" });
    expect(result.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact")).toEqual([]);
  });
});

describe("source-proven CommonJS object property references", () => {
  const provider = [
    "'use strict'",
    "const createError = require('@external/error')",
    "const codes = { SIZE: createError('SIZE', 'too large', 413), OTHER: createError('OTHER', 'other', 400) }",
    "module.exports = codes",
    "module.exports.helper = () => {}"
  ].join("\n");
  const consumer = [
    "'use strict'",
    "const { SIZE: TooLarge } = require('./provider')",
    "function reject() { new TooLarge() }"
  ].join("\n");
  const propertyEdges = (result: ReturnType<typeof graph>) => result.edges.filter((edge) =>
    edge.evidence?.ruleId === "module.commonjs-object-property-reference");

  it("links a constructor-site identifier to its exported property without claiming the runtime constructor", () => {
    const result = graph({ "provider.js": provider, "consumer.js": consumer });
    const target = result.symbols.find((symbol) => symbol.qualifiedName === "provider.js#codes.SIZE");
    expect(target).toMatchObject({ name: "SIZE", kind: "variable", filePath: "provider.js",
      range: { start: { line: 3, column: 17 } } });
    expect(propertyEdges(result)).toEqual([expect.objectContaining({
      kind: "references", resolution: "exact", filePath: "consumer.js", targetId: target?.id,
      range: { start: { line: 3, column: 25 }, end: { line: 3, column: 33 } },
      evidence: expect.objectContaining({ resolutionPath: ["consumer.js", "provider.js"],
        commonJsBinding: expect.objectContaining({
          policy: "javascript-commonjs-object-property-reference-v1", moduleSpecifier: "./provider",
          importedName: "SIZE", localName: "TooLarge",
          importSite: { filePath: "consumer.js", range: { start: { line: 2, column: 7 }, end: { line: 2, column: 49 } } },
          exportSite: { filePath: "provider.js", range: { start: { line: 3, column: 17 }, end: { line: 3, column: 60 } } }
        }) })
    })]);
    expect(result.edges).toContainEqual(expect.objectContaining({
      kind: "instantiates", resolution: "unresolved", targetId: null,
      referenceName: "TooLarge", filePath: "consumer.js"
    }));
  });

  it.each([
    ["duplicate key", "const codes = { SIZE: 1, SIZE: 2 }"],
    ["computed key", "const codes = { [key]: 1, SIZE: 2 }"],
    ["spread", "const codes = { SIZE: 1, ...other }"],
    ["getter", "const codes = { get SIZE() { return 1 } }"],
    ["reassigned object", "let codes = { SIZE: 1 }"],
    ["escaped object", "const codes = { SIZE: 1 }; pass(codes)"],
    ["direct property write", "const codes = { SIZE: 1 }; codes.SIZE = other"],
    ["destructuring property write", "const codes = { SIZE: 1 }; ({ value: codes.SIZE } = other)"],
    ["export property write", "const codes = { SIZE: 1 }; module.exports.SIZE = other"],
    ["dynamic export write", "const codes = { SIZE: 1 }; module.exports[name] = other"],
    ["object escape", "const codes = { SIZE: 1 }; Object.assign(codes, other)"],
    ["second export", "const codes = { SIZE: 1 }; module.exports = other"]
  ])("does not claim %s as a stable exported property", (_label, definition) => {
    const source = `'use strict'; ${definition}; module.exports = codes`;
    expect(propertyEdges(graph({ "provider.js": source, "consumer.js": consumer }))).toEqual([]);
  });

  it.each([
    ["mutable binding", "let { SIZE: TooLarge } = require('./provider'); new TooLarge()"],
    ["reassigned alias", "const { SIZE: TooLarge } = require('./provider'); TooLarge = other; new TooLarge()"],
    ["shadowed use", "const { SIZE: TooLarge } = require('./provider'); function f(TooLarge) { new TooLarge() }"],
    ["dynamic require", "const { SIZE: TooLarge } = require(path); new TooLarge()"]
  ])("does not resolve %s", (_label, body) => {
    expect(propertyEdges(graph({ "provider.js": provider, "consumer.js": `'use strict'; ${body}` }))).toEqual([]);
  });

  it("suppresses property references when another importer mutates the exported object", () => {
    const result = graph({ "provider.js": provider, "consumer.js": consumer,
      "mutator.js": "'use strict'; require('./provider').SIZE = other" });
    expect(propertyEdges(result)).toEqual([]);
  });

  it.each([
    "'use strict'; const { ...allCodes } = require('./provider'); Object.keys(allCodes)",
    "'use strict'; const codes = require('./provider'); Object.keys(codes); codes.SIZE"
  ])("retains property references through read-only observations: %s", (reader) => {
    expect(propertyEdges(graph({ "provider.js": provider, "consumer.js": consumer,
      "reader.js": reader }))).toHaveLength(1);
  });

  it.each([
    "const codes = require('./provider'); codes.SIZE = other",
    "const codes = require('./provider'); codes.SIZE()",
    "const codes = require('./provider'); pass(codes)",
    "function Object() {}; const codes = require('./provider'); Object.keys(codes)"
  ])("suppresses property references for unsafe module observations: %s", (reader) => {
    expect(propertyEdges(graph({ "provider.js": provider, "consumer.js": consumer,
      "reader.js": `'use strict'; ${reader}` }))).toEqual([]);
  });
});
