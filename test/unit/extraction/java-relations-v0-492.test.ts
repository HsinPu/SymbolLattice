import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java modern local initializer receiver call relations v0.492", () => {
  it("recovers explicit and var local object-creation receivers in a bounded block", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Runner {",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        final Worker worker = new Worker();",
        "        worker.handle();",
        "        var inferred = new Worker();",
        "        inferred.handle();",
        "      }",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });

    expect(facts.jvmFacts?.javaMemberCallReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        receiverKind: "local",
        receiverName: "worker",
        methodName: "handle"
      }),
      expect.objectContaining({
        receiverKind: "local",
        receiverName: "inferred",
        methodName: "handle",
        receiverInitializerRange: expect.any(Object)
      })
    ]));
  });

  it("fails closed for reassignment, argument escape, and nested shadow", () => {
    const reassigned = extractFileFacts({
      filePath: "src/app/Reassigned.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Reassigned {",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        final Worker worker = new Worker();",
        "        worker = new Worker();",
        "        worker.handle();",
        "      }",
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
        "  void consume(Worker value) {}",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        var worker = new Worker();",
        "        consume(worker);",
        "        worker.handle();",
        "      }",
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
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        final Worker worker = new Worker();",
        "        {",
        "          final Worker worker = new Worker();",
        "          worker.handle();",
        "        }",
        "      }",
        "      default -> {}",
        "    }",
        "  }",
        "}"
      ].join("\n")
    });

    for (const facts of [reassigned, escaped, shadowed]) {
      expect(
        (facts.jvmFacts?.javaMemberCallReferences ?? []).filter(
          (reference) => reference.receiverKind === "local"
        )
      ).toEqual([]);
    }
  });
});
