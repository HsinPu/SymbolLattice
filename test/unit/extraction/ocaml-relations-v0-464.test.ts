import { describe, expect, it } from "vitest";

import { extractOcamlFileFacts } from "../../../src/extraction/ocaml.js";

describe("OCaml v0.464 relation facts", () => {
  it("extracts modules, types, classes, signatures, heritage, and explicit overrides", () => {
    const facts = extractOcamlFileFacts({
      filePath: "src/api.ml",
      language: "ocaml",
      sourceText: [
        "module Api = struct",
        "  class point (value : int) = object",
        "    method magnitude : int = value",
        "  end",
        "  type data = { value: int }",
        "  type color = | Red = 0 | Blue = 1",
        "  type choice = | One | Two",
        "  type alias = point",
        "  class type contract = object",
        "    method act : point -> point",
        "  end",
        "  class base = object",
        "    method virtual run : point -> point",
        "  end",
        "  class service : contract = object",
        "    inherit base",
        "    method! run (p : point) : point = p",
        "  end",
        "  let helper (p : point) : point = p",
        "end"
      ].join("\n")
    });
    expect(facts.ocamlFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Api", declarationKind: "module" }),
      expect.objectContaining({ name: "point", declarationKind: "class" }),
      expect.objectContaining({ name: "data", declarationKind: "record" }),
      expect.objectContaining({ name: "color", declarationKind: "enum" }),
      expect.objectContaining({ name: "choice", declarationKind: "variant" }),
      expect.objectContaining({ name: "alias", declarationKind: "typealias" }),
      expect.objectContaining({ name: "contract", declarationKind: "interface" })
    ]));
    expect(facts.ocamlFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "point", callableKind: "constructor", parameterCount: 1 }),
      expect.objectContaining({ name: "magnitude", callableKind: "method" }),
      expect.objectContaining({ name: "run", callableKind: "method", isOverride: true, returnTypeName: "point" })
    ]));
    expect(facts.ocamlFacts?.heritage).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "base", relationKind: "extends" }),
      expect.objectContaining({ referenceName: "contract", relationKind: "implements" })
    ]));
    expect(facts.ocamlFacts?.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodName: "run", ownerTypeName: "service" })
    ]));
  });

  it("keeps inferred, mutable, generic, and malformed shapes out of exact facts", () => {
    const facts = extractOcamlFileFacts({
      filePath: "src/negative.ml",
      language: "ocaml",
      sourceText: [
        "module Negative = struct",
        "  class point = object method run = () end",
        "  let caller value =",
        "    let local = new point in",
        "    let mutableValue = ref local in",
        "    mutableValue := local;",
        "    local#run",
        "  let generic value = value#run",
        "end"
      ].join("\n")
    });
    expect(facts.ocamlFacts?.calls ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ receiverName: "local" }),
      expect.objectContaining({ receiverName: "value" })
    ]));
    expect(facts.ocamlFacts?.parserRejected).toBe(false);
  });
});
