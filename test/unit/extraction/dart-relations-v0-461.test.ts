import { describe, expect, it } from "vitest";

import { extractDartFileFacts } from "../../../src/extraction/dart.js";

describe("Dart v0.461 relation facts", () => {
  it("retains Dart declarations, imports, calls, constructors, heritage, signatures, and overrides", () => {
    const facts = extractDartFileFacts({
      filePath: "lib/relations.dart",
      language: "dart",
      sourceText: [
        "import 'api.dart';",
        "export 'other.dart';",
        "class Base {",
        "  Base(int value) {}",
        "  void run() {}",
        "}",
        "class Child extends Base with Mixin implements Contract {",
        "  Child(int value) : super(value);",
        "  @override",
        "  void run() {}",
        "}",
        "mixin Mixin {",
        "  void mix() {}",
        "}",
        "abstract class Contract {",
        "  void act();",
        "}",
        "enum Color { red, blue }",
        "extension PointExt on Point {",
        "  int doubled() => 2;",
        "}",
        "typedef Alias = Point;",
        "class Point {",
        "  Point(int value) {}",
        "  int magnitude() => 0;",
        "}",
        "int helper(Point value) => value.magnitude();",
        "void caller() {",
        "  final Point local = Point(1);",
        "  local.magnitude();",
        "  local.doubled();",
        "  helper(Point(1));",
        "  Child(1);",
        "}"
      ].join("\n")
    });

    expect(facts.dartFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Base", declarationKind: "class" }),
      expect.objectContaining({ name: "Mixin", declarationKind: "mixin" }),
      expect.objectContaining({ name: "Color", declarationKind: "enum" }),
      expect.objectContaining({ name: "Alias", declarationKind: "typedef" }),
      expect.objectContaining({ name: "PointExt", declarationKind: "extension" })
    ]));
    expect(facts.dartFacts?.imports).toEqual(expect.arrayContaining([
      expect.objectContaining({ importedPath: "api.dart", relationKind: "imports" }),
      expect.objectContaining({ importedPath: "other.dart", relationKind: "exports" })
    ]));
    expect(facts.dartFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Point", callableKind: "constructor", parameterCount: 1 }),
      expect.objectContaining({ name: "doubled", callableKind: "extension", receiverTypeName: "Point" }),
      expect.objectContaining({ name: "helper", callableKind: "function", parameterTypeNames: ["Point"] }),
      expect.objectContaining({ name: "run", isOverride: true })
    ]));
    expect(facts.dartFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "magnitude", callKind: "member", receiverTypeName: "Point" }),
      expect.objectContaining({ referenceName: "doubled", callKind: "member", receiverTypeName: "Point" }),
      expect.objectContaining({ referenceName: "helper", callKind: "direct" })
    ]));
    expect(facts.dartFacts?.instantiations).toEqual(expect.arrayContaining([
      expect.objectContaining({ typeName: "Point", argumentCount: 1 }),
      expect.objectContaining({ typeName: "Child", argumentCount: 1 })
    ]));
    expect(facts.dartFacts?.heritage).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "Base", relationKind: "extends" }),
      expect.objectContaining({ referenceName: "Mixin", relationKind: "with" }),
      expect.objectContaining({ referenceName: "Contract", relationKind: "implements" })
    ]));
    expect(facts.dartFacts?.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodName: "run", ownerTypeName: "Child" })
    ]));
  });

  it("does not retain optional, generic, chained, dynamic, mutated, or escaped receivers", () => {
    const facts = extractDartFileFacts({
      filePath: "lib/negative.dart",
      language: "dart",
      sourceText: [
        "class Point {",
        "  Point(int value) {}",
        "  void run() {}",
        "}",
        "void consume(Point value) {}",
        "void caller(Point? optional, Point value) {",
        "  final Point local = value;",
        "  local.run();",
        "  consume(value);",
        "  value.run();",
        "  optional?.run();",
        "  Point(1).run();",
        "}"
      ].join("\n")
    });
    expect(facts.dartFacts?.calls ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ receiverName: "optional" }),
      expect.objectContaining({ receiverName: "value" }),
      expect.objectContaining({ receiverName: "local" })
    ]));
  });
});
