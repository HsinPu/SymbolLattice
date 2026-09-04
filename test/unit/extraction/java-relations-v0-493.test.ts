import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java modern generic local initializer receiver calls v0.493", () => {
  it("retains single-level generic and diamond local initializers with raw-type evidence", () => {
    const facts = extractFileFacts({
      filePath: "src/app/GenericRunner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Box;",
        "class GenericRunner {",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        var inferred = new Box<String>();",
        "        inferred.run();",
        "        Box<String> explicit = new Box<>();",
        "        explicit.run();",
        "      }",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });

    const locals = (facts.jvmFacts?.javaMemberCallReferences ?? []).filter(
      (reference) => reference.receiverKind === "local"
    );
    expect(locals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        receiverName: "inferred",
        receiverType: expect.objectContaining({ referenceName: "Box" }),
        receiverInitializerRange: expect.any(Object),
        methodName: "run"
      }),
      expect.objectContaining({
        receiverName: "explicit",
        receiverType: expect.objectContaining({ referenceName: "Box" }),
        methodName: "run"
      })
    ]));
  });

  it("fails closed for wildcard, array, nested-generic, and anonymous generic shapes", () => {
    const sources = [
      "var wildcard = new Box<? extends Service>(); wildcard.run();",
      "var array = new Box<Service[]>(); array.run();",
      "var nested = new Box<List<Service>>(); nested.run();",
      "var anonymous = new Box<Service>() { public void run() {} }; anonymous.run();"
    ];
    for (const [index, statement] of sources.entries()) {
      const facts = extractFileFacts({
        filePath: `src/app/GenericNegative${index}.java`,
        language: "java",
        sourceText: [
          "package app;",
          "import api.Box;",
          "class GenericNegative {",
          "  void run(Object value) {",
          "    switch (value) {",
          "      case String text -> {",
          `        ${statement}`,
          "      }",
          "      default -> {}",
          "    }",
          "  }",
          "}"
        ].join("\n")
      });
      expect(
        (facts.jvmFacts?.javaMemberCallReferences ?? []).filter(
          (reference) => reference.receiverKind === "local"
        )
      ).toEqual([]);
    }
  });
});
