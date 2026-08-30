import { describe, expect, it } from "vitest";

import { extractSwiftFileFacts } from "../../../src/extraction/swift.js";

describe("Swift v0.460 relation facts", () => {
  it("retains declarations, explicit initializers, calls, extensions, heritage, and overrides", () => {
    const facts = extractSwiftFileFacts({
      filePath: "Sources/Demo/Relations.swift",
      language: "swift",
      sourceText: `public protocol Contract {
  func act()
}
public class Base {
  init() {}
  public func run() {}
}
public class Service: Base, Contract {
  init(value: Int) {}
  override public func run() {}
  func act() {}
}
public struct Point {
  init(x: Int) {}
  public func magnitude() {}
}
extension Point: Contract {
  func act() {}
}
public enum Color { case red }
public typealias Alias = Point
private func helper() {}
func caller(_ point: Point) {
  point.magnitude()
  Point(x: 1)
  helper()
}`
    });

    expect(facts.swiftFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Contract", declarationKind: "protocol", isExported: true }),
      expect.objectContaining({ name: "Service", declarationKind: "class" }),
      expect.objectContaining({ name: "Point", declarationKind: "struct" }),
      expect.objectContaining({ name: "Color", declarationKind: "enum" }),
      expect.objectContaining({ name: "Alias", declarationKind: "typealias", aliasTargetName: "Point" })
    ]));
    expect(facts.swiftFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "init", callableKind: "initializer", ownerTypeName: "Point", parameterCount: 1 }),
      expect.objectContaining({ name: "magnitude", callableKind: "method", ownerTypeName: "Point" }),
      expect.objectContaining({ name: "act", callableKind: "extension", ownerTypeName: "Point" }),
      expect.objectContaining({ name: "run", isOverride: true })
    ]));
    expect(facts.swiftFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "magnitude", callKind: "member", receiverTypeName: "Point" }),
      expect.objectContaining({ referenceName: "helper", callKind: "direct" })
    ]));
    expect(facts.swiftFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Point", argumentCount: 1 })
    ]);
    expect(facts.swiftFacts?.heritage).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "Base", sourceTypeKind: "class" }),
      expect.objectContaining({ referenceName: "Contract" })
    ]));
    expect(facts.swiftFacts?.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodName: "run", ownerTypeName: "Service" })
    ]));
  });

  it("does not record unsafe generic, optional, chained, closure, or mutable receiver shapes", () => {
    const facts = extractSwiftFileFacts({
      filePath: "Sources/Demo/Negative.swift",
      language: "swift",
      sourceText: `struct Point {
  init(x: Int) {}
  func run() {}
}
func caller(_ point: Point?, _ value: Point) {
  var mutable: Point = value
  mutable = value
  point?.run()
  Point(x: 1).run()
  let callback = { value.run() }
  value.run()
}`
    });

    expect(facts.swiftFacts?.calls ?? []).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "run", receiverTypeName: "Point" })
    ]));
    expect(facts.swiftFacts?.calls ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ receiverName: "point" }),
      expect.objectContaining({ receiverName: "mutable" })
    ]));
    expect(facts.swiftFacts?.instantiations ?? []).toEqual([
      expect.objectContaining({ typeName: "Point", argumentCount: 1 })
    ]);
  });
});
