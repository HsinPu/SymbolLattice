import { describe, expect, it } from "vitest";

import { extractCsharpFileFacts } from "../../../src/extraction/csharp.js";

describe("C# v0.462 relation facts", () => {
  it("retains namespace, type, using, callable, construction, heritage, signature, and override facts", () => {
    const facts = extractCsharpFileFacts({
      filePath: "src/api.cs",
      language: "csharp",
      sourceText: [
        "using Demo.Api;",
        "namespace Demo.Api {",
        "  public interface IContract { void Act(Point p); }",
        "  public record Point(int Value);",
        "  public struct Value { public int X; }",
        "  public enum Color { Red, Blue }",
        "  public delegate void Handler(Point p);",
        "  public class Base {",
        "    public Base(int value) {}",
        "    public virtual Point Run(Point p) => p;",
        "  }",
        "  public class Service : Base, IContract {",
        "    public Service(int value) : base(value) {}",
        "    public override Point Run(Point p) => p;",
        "    public void Act(Point p) {}",
        "  }",
        "  public static class Helpers { public static Point Helper(Point p) => p; }",
        "}"
      ].join("\n")
    });
    expect(facts.csharpFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Demo.Api", declarationKind: "namespace" }),
      expect.objectContaining({ name: "IContract", declarationKind: "interface" }),
      expect.objectContaining({ name: "Point", declarationKind: "record" }),
      expect.objectContaining({ name: "Value", declarationKind: "struct" }),
      expect.objectContaining({ name: "Color", declarationKind: "enum" }),
      expect.objectContaining({ name: "Handler", declarationKind: "delegate" })
    ]));
    expect(facts.csharpFacts?.usings).toEqual(expect.arrayContaining([
      expect.objectContaining({ importedPath: "Demo.Api", isStatic: false, isAlias: false })
    ]));
    expect(facts.csharpFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Point", callableKind: "constructor", parameterCount: 1 }),
      expect.objectContaining({ name: "Run", callableKind: "method", isOverride: true, returnTypeName: "Point" }),
      expect.objectContaining({ name: "Helper", callableKind: "method", isStatic: true })
    ]));
    expect(facts.csharpFacts?.heritage).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "Base" }),
      expect.objectContaining({ referenceName: "IContract" })
    ]));
    expect(facts.csharpFacts?.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodName: "Run", ownerTypeName: "Service" })
    ]));
  });

  it("keeps dynamic, generic, mutated, escaped, computed, and lambda receivers out of exact facts", () => {
    const facts = extractCsharpFileFacts({
      filePath: "src/negative.cs",
      language: "csharp",
      sourceText: [
        "public class Point { public Point(int value) {} public void Run() {} }",
        "public static void Consume(Point value) {}",
        "public static void Caller(Point point, dynamic value, string name) {",
        "  Point local = point;",
        "  local = point;",
        "  local.Run();",
        "  Consume(point);",
        "  point.Run();",
        "  value[name]();",
        "  System.Action callback = () => point.Run();",
        "}"
      ].join("\n")
    });
    expect(facts.csharpFacts?.calls ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ receiverName: "local" }),
      expect.objectContaining({ receiverName: "point" }),
      expect.objectContaining({ receiverName: "value" })
    ]));
  });
});
