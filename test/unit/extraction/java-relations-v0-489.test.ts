import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java modern callable call relations v0.489", () => {
  it("retains bare private/static calls from a clean modern parse", () => {
    const facts = extractFileFacts({
      filePath: "src/Runner.java",
      language: "java",
      sourceText: [
        "class Runner {",
        "  private static void helper() {}",
        "  private void instance() {}",
        "  static void entry(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    helper();",
        "  }",
        "  void run(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    instance();",
        "  }",
        "}"
      ].join("\n")
    });
    const symbolsById = new Map(facts.symbols.map((symbol) => [symbol.id, symbol]));
    const references = facts.jvmFacts?.javaMemberCallReferences ?? [];

    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        receiverKind: "implicit-static",
        methodName: "helper",
        argumentCount: 0
      }),
      expect.objectContaining({
        receiverKind: "implicit-instance",
        methodName: "instance",
        argumentCount: 0
      })
    ]));
    expect(
      references
        .map((reference) => symbolsById.get(reference.sourceId)?.name)
        .filter((name): name is string => name !== undefined)
    ).toEqual(expect.arrayContaining(["entry", "run"]));
  });

  it("does not turn an arity-only overload set into exact evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/Ambiguous.java",
      language: "java",
      sourceText: [
        "class Ambiguous {",
        "  private static void helper(int value) {}",
        "  private static void helper(long value) {}",
        "  static void entry(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    helper(1);",
        "  }",
        "}"
      ].join("\n")
    });

    expect(
      facts.edges.filter((edge) =>
        edge.kind === "calls" && edge.referenceName === "helper"
      )
    ).toEqual([]);
  });

  it("keeps matching static imports outside the implicit-call proof", () => {
    const facts = extractFileFacts({
      filePath: "src/StaticImport.java",
      language: "java",
      sourceText: [
        "import static external.Utility.helper;",
        "class StaticImport {",
        "  private static void helper(int value) {}",
        "  static void entry(Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    helper(1);",
        "  }",
        "}"
      ].join("\n")
    });

    expect(
      facts.jvmFacts?.javaMemberCallReferences?.some((reference) =>
        reference.methodName === "helper"
      )
    ).toBe(false);
    expect(
      facts.edges.filter((edge) => edge.kind === "calls" && edge.referenceName === "helper")
    ).toEqual([]);
  });
});
