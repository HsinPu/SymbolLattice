import { describe, expect, it } from "vitest";

import { extractFsharpFileFacts } from "../../../src/extraction/fsharp.js";

describe("F# v0.463 relation facts", () => {
  it("extracts modules, type identities, explicit signatures, constructors, heritage, and overrides", () => {
    const facts = extractFsharpFileFacts({
      filePath: "src/api.fs",
      language: "fsharp",
      sourceText: [
        "module Demo.Api",
        "",
        "type Point(value: int) =",
        "    member _.Magnitude() : int = value",
        "",
        "type Data = { Value: int }",
        "[<Struct>]",
        "type Value = { X: int }",
        "type Color = | Red = 0 | Blue = 1",
        "type Choice = | One | Two",
        "type IContract = abstract Act: Point -> Point",
        "type Handler = delegate of Point -> Point",
        "type Alias = Point",
        "",
        "type Base() =",
        "    abstract Run: Point -> Point",
        "",
        "type Service() =",
        "    inherit Base()",
        "    interface IContract with",
        "        member _.Act(p: Point) : Point = p",
        "    override _.Run(p: Point) : Point = p"
      ].join("\n")
    });
    expect(facts.fsharpFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Demo.Api", declarationKind: "module" }),
      expect.objectContaining({ name: "Point", declarationKind: "class" }),
      expect.objectContaining({ name: "Data", declarationKind: "record" }),
      expect.objectContaining({ name: "Value", declarationKind: "struct" }),
      expect.objectContaining({ name: "Color", declarationKind: "enum" }),
      expect.objectContaining({ name: "Choice", declarationKind: "union" }),
      expect.objectContaining({ name: "IContract", declarationKind: "interface" }),
      expect.objectContaining({ name: "Handler", declarationKind: "delegate" }),
      expect.objectContaining({ name: "Alias", declarationKind: "typealias" })
    ]));
    expect(facts.fsharpFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Point", callableKind: "constructor", parameterCount: 1 }),
      expect.objectContaining({ name: "Magnitude", callableKind: "method", returnTypeName: "int" }),
      expect.objectContaining({ name: "Run", callableKind: "method", isOverride: true, returnTypeName: "Point" })
    ]));
    expect(facts.fsharpFacts?.heritage).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "Base", relationKind: "extends" }),
      expect.objectContaining({ referenceName: "IContract", relationKind: "implements" })
    ]));
    expect(facts.fsharpFacts?.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodName: "Run", ownerTypeName: "Service" })
    ]));
  });

  it("keeps mutable, dynamic, generic, and ambiguous receiver shapes out of exact facts", () => {
    const facts = extractFsharpFileFacts({
      filePath: "src/negative.fs",
      language: "fsharp",
      sourceText: [
        "module Demo.Negative",
        "type Point(value: int) =",
        "    member _.Run() = value",
        "let caller (point: Point) =",
        "    let mutable local = Point(1)",
        "    local <- Point(2)",
        "    local.Run()",
        "    let unknown = point",
        "    unknown.Run()",
        "    let generic = Point<int>(1)",
        "    generic.Run()"
      ].join("\n")
    });
    expect(facts.fsharpFacts?.calls ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ receiverName: "local" }),
      expect.objectContaining({ receiverName: "unknown" }),
      expect.objectContaining({ receiverName: "generic" })
    ]));
  });
});
