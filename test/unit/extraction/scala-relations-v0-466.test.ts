import { describe, expect, it } from "vitest";

import { extractScalaFileFacts } from "../../../src/extraction/scala.js";

describe("Scala v0.466 bounded relation facts", () => {
  it("extracts package types, typed methods, imports, calls, creation, heritage, and overrides", () => {
    const facts = extractScalaFileFacts({
      filePath: "src/Api.scala",
      language: "scala",
      sourceText: [
        "package demo.api",
        "trait Contract { def run(value: Int): Int }",
        "class Base { def run(value: Int): Int = value }",
        "case class Point(value: Int) { def magnitude(): Int = value }",
        "class Service(val point: Point) extends Base with Contract { override def run(value: Int): Int = value }",
        "object Api { def helper(point: Point): Point = point }",
        "enum Color { case Red, Blue }",
        "type Alias = Point"
      ].join("\n")
    });
    expect(facts.scalaRelationFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Contract", declarationKind: "trait" }),
      expect.objectContaining({ name: "Point", declarationKind: "caseclass", constructorParameterCount: 1 }),
      expect.objectContaining({ name: "Color", declarationKind: "enum" }),
      expect.objectContaining({ name: "Alias", declarationKind: "typealias" })
    ]));
    expect(facts.scalaRelationFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "helper", callableKind: "method", parameterCount: 1, returnTypeName: "Point" }),
      expect.objectContaining({ name: "run", ownerTypeName: "Service", isOverride: true })
    ]));
    expect(facts.scalaRelationFacts?.heritage).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "Base", relationKind: "extends" }),
      expect.objectContaining({ referenceName: "Contract", relationKind: "implements" })
    ]));
    expect(facts.scalaRelationFacts?.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodName: "run", ownerTypeName: "Service" })
    ]));
  });

  it("keeps overloads, defaults, implicits, extensions, and malformed syntax out of exact facts", () => {
    const sources = [
      "object Bad { def helper(value: Int): Int = value; def helper(value: String): String = value; def run(): Int = helper(1) }",
      "object Bad { def helper(value: Int = 1): Int = value; def run(): Int = helper() }",
      "object Bad { implicit def helper(): Int = 1; def run(): Int = helper() }",
      "object Bad { extension (value: Int) def helper(): Int = value; def run(): Int = helper() }",
      "class Bad { def broken( = }"
    ];
    for (const sourceText of sources) {
      const facts = extractScalaFileFacts({ filePath: "src/Bad.scala", language: "scala", sourceText });
      expect(facts.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact")).toEqual([]);
    }
  });
});
