import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java modern callable signature relations v0.488", () => {
  it("retains direct imported parameter and return types from a clean modern parse", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Input;",
        "import api.Result;",
        "class Runner {",
        "  Result run(Input input) {",
        "    if (input instanceof String text) { System.out.println(text); }",
        "    return null;",
        "  }",
        "}"
      ].join("\n")
    });
    const method = facts.symbols.find((symbol) => symbol.name === "run");
    const references = (facts.jvmFacts?.callableSignatureReferences ?? []).filter(
      (reference) => reference.sourceId === method?.id
    );

    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relationKind: "returns",
        referenceName: "Result",
        importedTypePath: "api.Result",
        isTopLevelType: true
      }),
      expect.objectContaining({
        relationKind: "accepts",
        referenceName: "Input",
        importedTypePath: "api.Input",
        isTopLevelType: false
      })
    ]));
  });

  it("keeps parser-recovery signatures conservative for type variables and arrays", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Input;",
        "class Runner<T> {",
        "  <M> M generic(M value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    return value;",
        "  }",
        "  Input[] array(Input[] value) {",
        "    if (value instanceof String[] text) { System.out.println(text); }",
        "    return value;",
        "  }",
        "}"
      ].join("\n")
    });
    const references = facts.jvmFacts?.callableSignatureReferences ?? [];

    expect(references.some((reference) => reference.referenceName === "M")).toBe(false);
    expect(
      references.filter((reference) =>
        ["generic", "array"].includes(
          facts.symbols.find((symbol) => symbol.id === reference.sourceId)?.name ?? ""
        )
      )
    ).toEqual([]);
  });

  it("does not retain an ambiguous modern import as exact signature evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Input;",
        "import other.Input;",
        "class Runner {",
        "  Input run(Input input) {",
        "    if (input instanceof String text) { System.out.println(text); }",
        "    return input;",
        "  }",
        "}"
      ].join("\n")
    });

    expect(facts.jvmFacts?.callableSignatureReferences ?? []).toEqual([]);
  });
});
