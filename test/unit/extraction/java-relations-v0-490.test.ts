import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java modern parameter receiver call relations v0.490", () => {
  it("retains a direct typed parameter receiver from a clean modern parse", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Runner {",
        "  void run(Worker worker, Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    worker.handle();",
        "  }",
        "}"
      ].join("\n")
    });

    expect(facts.jvmFacts?.javaMemberCallReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        receiverKind: "parameter",
        receiverName: "worker",
        methodName: "handle",
        argumentCount: 0,
        receiverType: expect.objectContaining({
          referenceName: "Worker",
          importedTypePath: "api.Worker"
        })
      })
    ]));
  });

  it("fails closed when the parameter is reassigned or escapes", () => {
    const reassigned = extractFileFacts({
      filePath: "src/app/Reassigned.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.Worker;",
        "class Reassigned {",
        "  void run(Worker worker, Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    worker = new Worker();",
        "    worker.handle();",
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
        "  void consume(Object value) {}",
        "  void run(Worker worker, Object value) {",
        "    if (value instanceof String text) { System.out.println(text); }",
        "    consume(worker);",
        "    worker.handle();",
        "  }",
        "}"
      ].join("\n")
    });

    expect(
      (reassigned.jvmFacts?.javaMemberCallReferences ?? []).filter(
        (reference) => reference.receiverKind === "parameter"
      )
    ).toEqual([]);
    expect(
      (escaped.jvmFacts?.javaMemberCallReferences ?? []).filter(
        (reference) => reference.receiverKind === "parameter"
      )
    ).toEqual([]);
  });
});
