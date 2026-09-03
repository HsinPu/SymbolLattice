import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java modern field receiver call relations v0.491", () => {
  it("recovers a final generic field declaration and direct member receiver", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Runner {",
        "  private final Worker worker;",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> worker.handle();",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });

    expect(facts.jvmFacts?.javaFieldDeclarations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "worker",
        isFinal: true,
        type: expect.objectContaining({
          kind: "reference",
          referenceName: "Worker",
          importedTypePath: "api.Worker"
        })
      })
    ]));
    expect(facts.jvmFacts?.javaMemberCallReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        receiverKind: "field",
        receiverName: "worker",
        methodName: "handle",
        argumentCount: 0
      })
    ]));
  });

  it("fails closed for mutable, escaped, and shadowed field receivers", () => {
    const mutable = extractFileFacts({
      filePath: "src/app/Mutable.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Mutable {",
        "  private Worker worker;",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> worker.handle();",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });
    const escaped = extractFileFacts({
      filePath: "src/app/Escaped.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Escaped {",
        "  private final Worker worker;",
        "  void consume(Worker value) {}",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> { consume(worker); worker.handle(); }",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });
    const shadowed = extractFileFacts({
      filePath: "src/app/Shadowed.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Shadowed {",
        "  private final Worker worker;",
        "  void run(Worker worker, Object value) {",
        "    switch (value) {",
        "      case String text -> worker.handle();",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });

    for (const facts of [mutable, escaped, shadowed]) {
      expect(
        (facts.jvmFacts?.javaMemberCallReferences ?? []).filter(
          (reference) => reference.receiverKind === "field"
        )
      ).toEqual([]);
    }
  });
});
