import { describe, expect, it } from "vitest";

import { extractNimFileFacts } from "../../../src/extraction/nim.js";

describe("Nim v0.471 bounded relation facts", () => {
  it("extracts typed procs, imports, calls, object heritage, and construction", () => {
    const facts = extractNimFileFacts({
      filePath: "src/app.nim",
      language: "nim",
      sourceText: [
        "type",
        "  Parent* = object",
        "  Child* = object of Parent",
        "import api as api",
        "proc helper*(value: int): int = value",
        "proc local*(value: int): int = helper(value)",
        "proc remote*(value: int): int = api.build(value)",
        "proc make*(): Child = Child()"
      ].join("\n")
    });

    expect(facts.nimFacts?.parserRejected).toBe(false);
    expect(facts.nimFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Parent", declarationKind: "object", isExported: true }),
      expect.objectContaining({ name: "Child", declarationKind: "object", isExported: true })
    ]));
    expect(facts.nimFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "helper", parameterCount: 1, parameterTypeNames: ["int"], returnTypeName: "int" }),
      expect.objectContaining({ name: "make", parameterCount: 0, returnTypeName: "Child" })
    ]));
    expect(facts.nimFacts?.imports).toEqual([
      expect.objectContaining({ importedModule: "api", localName: "api" })
    ]);
    expect(facts.nimFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ callKind: "direct", referenceName: "helper", argumentCount: 1 }),
      expect.objectContaining({ callKind: "module", receiverModuleName: "api", referenceName: "build", argumentCount: 1 })
    ]));
    expect(facts.nimFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Child", argumentCount: 0 })
    ]);
    expect(facts.nimFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "Child", referenceName: "Parent", relationKind: "extends" })
    ]);
  });

  it("fails closed for malformed source and unsupported control-flow or dynamic forms", () => {
    const malformed = extractNimFileFacts({ filePath: "src/bad.nim", language: "nim", sourceText: "proc run*(value: int): int = value(" });
    expect(malformed.nimFacts?.parserRejected).toBe(true);
    expect(malformed.nimFacts?.calls).toEqual([]);

    const unsafe = extractNimFileFacts({
      filePath: "src/unsafe.nim",
      language: "nim",
      sourceText: [
        "proc run*(value: int): int = if value > 0: value else: 0",
        "template generated(value: int): int = value",
        "proc dynamic*(value: int): int = generated(value)"
      ].join("\n")
    });
    expect(unsafe.nimFacts?.parserRejected).toBe(true);
    expect(unsafe.nimFacts?.calls).toEqual([]);
  });
});
