import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java relation depth v0.486", () => {
  it("retains direct heritage from the modern parser when legacy syntax has recovery errors", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Child.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Contract;",
        "public class Child extends Base<String> implements Contract<Integer> {",
        "  void run(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "  }",
        "}"
      ].join("\n")
    });

    expect(facts.symbols.map(({ name }) => name)).toEqual(["Child.java", "Child", "run"]);
    expect(facts.jvmFacts?.heritageReferences).toEqual([
      expect.objectContaining({
        referenceName: "Base",
        syntax: "java-class-superclass"
      }),
      expect.objectContaining({
        referenceName: "Contract",
        syntax: "java-class-interface",
        importedTypePath: "api.Contract"
      })
    ]);
  });

  it("keeps duplicate imports and unsupported nested type paths out of modern heritage proof", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Child.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Contract;",
        "import other.Contract;",
        "public class Child implements Contract, Outer.Inner {",
        "  void run(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "  }",
        "}"
      ].join("\n")
    });

    expect(
      facts.jvmFacts?.heritageReferences.filter((reference) => reference.referenceName === "Contract")
    ).toEqual([]);
    expect(
      facts.jvmFacts?.heritageReferences.some((reference) => reference.referenceName === "Inner")
    ).toBe(false);
  });

  it("fails closed when the modern parser cannot accept the complete declaration", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Broken.java",
      language: "java",
      sourceText: "package app; class Broken extends Base implements Contract { void run(Object value) {"
    });

    expect(facts.jvmFacts?.heritageReferences).toEqual([]);
  });
});
