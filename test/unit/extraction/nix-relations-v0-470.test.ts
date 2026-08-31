import { describe, expect, it } from "vitest";

import { extractNixFileFacts } from "../../../src/extraction/nix.js";

describe("Nix v0.470 bounded relation facts", () => {
  it("extracts function attributes, literal imports, local calls, and imported attribute calls", () => {
    const facts = extractNixFileFacts({
      filePath: "src/default.nix",
      language: "nix",
      sourceText: [
        "{",
        "  helper = value: value;",
        "  imported = import ./api.nix;",
        "  local = value: helper value;",
        "  remote = value: imported.build value;",
        "}"
      ].join("\n")
    });

    expect(facts.nixFacts?.parserRejected).toBe(false);
    expect(facts.nixFacts?.attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "helper", kind: "function", parameterCount: 1, isExported: true }),
      expect.objectContaining({ name: "imported", kind: "variable", isExported: true }),
      expect.objectContaining({ name: "local", kind: "function", parameterCount: 1, isExported: true }),
      expect.objectContaining({ name: "remote", kind: "function", parameterCount: 1, isExported: true })
    ]));
    expect(facts.nixFacts?.imports).toEqual([
      expect.objectContaining({ importedPath: "./api.nix", bindingName: "imported" })
    ]);
    expect(facts.nixFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ callKind: "direct", referenceName: "helper", argumentCount: 1 }),
      expect.objectContaining({ callKind: "attribute", receiverName: "imported", referenceName: "build", argumentCount: 1 })
    ]));
  });

  it("fails closed for malformed source and evaluator/runtime-shaped bodies", () => {
    const malformed = extractNixFileFacts({ filePath: "src/bad.nix", language: "nix", sourceText: "{ value = x: x;" });
    expect(malformed.nixFacts?.parserRejected).toBe(true);
    expect(malformed.nixFacts?.calls).toEqual([]);

    const unsafe = extractNixFileFacts({
      filePath: "src/unsafe.nix",
      language: "nix",
      sourceText: [
        "{",
        "  dynamic = name: name name;",
        "  scoped = value: with value; value;",
        "  package = args: callPackage ./package.nix {};",
        "}"
      ].join("\n")
    });
    expect(unsafe.nixFacts?.parserRejected).toBe(false);
    expect(unsafe.nixFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ callKind: "direct", referenceName: "name" })
    ]));
    expect(unsafe.nixFacts?.calls).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "callPackage" })
    ]));
  });
});
