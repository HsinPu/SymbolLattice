import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java modern declared-supertype local initializer calls v0.494", () => {
  it("retains a direct declared-supertype initializer candidate for hierarchy proof", () => {
    const facts = extractFileFacts({
      filePath: "src/app/WideningRunner.java",
      language: "java",
      sourceText: [
        "package app;",
        "import api.BaseService;",
        "import api.ConcreteService;",
        "class WideningRunner {",
        "  void run(Object value) {",
        "    switch (value) {",
        "      case String text -> {",
        "        BaseService service = new ConcreteService();",
        "        service.run();",
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
        receiverName: "service",
        receiverType: expect.objectContaining({ referenceName: "BaseService" }),
        receiverInitializerRange: expect.any(Object),
        methodName: "run"
      })
    ]));
  });

  it("keeps generic, wildcard, array, nested-generic, and anonymous widening fail-closed", () => {
    const sources = [
      "BaseService<String> generic = new ConcreteService<String>(); generic.run();",
      "BaseService wildcard = new ConcreteService<? extends BaseService>(); wildcard.run();",
      "BaseService array = new ConcreteService<BaseService[]>(); array.run();",
      "BaseService nested = new Wrapper<ConcreteService>(); nested.run();",
      "BaseService anonymous = new ConcreteService() { public void run() {} }; anonymous.run();"
    ];
    for (const [index, statement] of sources.entries()) {
      const facts = extractFileFacts({
        filePath: `src/app/WideningNegative${index}.java`,
        language: "java",
        sourceText: [
          "package app;",
          "import api.BaseService;",
          "import api.ConcreteService;",
          "import api.Wrapper;",
          "class WideningNegative {",
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
