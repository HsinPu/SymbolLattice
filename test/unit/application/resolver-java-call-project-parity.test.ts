import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import type { GraphEdge, GraphSnapshot, SymbolNode } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";
type FixtureFiles = Readonly<Record<string, string>>;

function sourceDocuments(files: FixtureFiles): readonly SourceDocument[] {
  return Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, sourceText]) => ({
      relativePath,
      absolutePath: `/java-call-project-parity/${relativePath}`,
      language: "java",
      sourceText,
      contentHash: createHash("sha256").update(sourceText).digest("hex")
    }));
}

function resolveFixture(files: FixtureFiles): GraphSnapshot {
  const documents = sourceDocuments(files);
  return resolveProjectFacts({
    sourceDocuments: documents,
    extractedFiles: documents.map((document) => extractFileFacts({
      filePath: document.relativePath,
      sourceText: document.sourceText,
      language: document.language
    })),
    indexedAt: INDEXED_AT
  });
}

function findSymbol(
  result: GraphSnapshot,
  filePath: string,
  name: string,
  kind?: SymbolNode["kind"]
): SymbolNode {
  const symbol = result.symbols.find((candidate) =>
    candidate.filePath === filePath &&
    (candidate.name === name || candidate.qualifiedName.endsWith(`#${name}`)) &&
    (kind === undefined || candidate.kind === kind)
  );
  if (symbol === undefined) {
    throw new Error(`Missing ${kind ?? "any"} symbol ${filePath}#${name}`);
  }
  return symbol;
}

type ExpectedExactEdge = {
  readonly sourceFilePath: string;
  readonly sourceName: string;
  readonly sourceKind?: SymbolNode["kind"];
  readonly targetFilePath: string;
  readonly targetName: string;
  readonly targetKind?: SymbolNode["kind"];
  readonly kind: GraphEdge["kind"];
  readonly ruleId: string;
};

function expectExactEdge(result: GraphSnapshot, expected: ExpectedExactEdge): void {
  const source = findSymbol(result, expected.sourceFilePath, expected.sourceName, expected.sourceKind);
  const target = findSymbol(result, expected.targetFilePath, expected.targetName, expected.targetKind);
  expect(result.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({
      sourceId: source.id,
      targetId: target.id,
      kind: expected.kind,
      resolution: "exact",
      confidence: 1,
      evidence: expect.objectContaining({
        ruleId: expected.ruleId,
        stage: "module",
        candidateSymbolIds: [target.id]
      })
    })
  ]));
}

function expectNoExactEdgesFrom(result: GraphSnapshot, filePaths: readonly string[]): void {
  const relationKinds = new Set<GraphEdge["kind"]>([
    "accepts",
    "calls",
    "instantiates",
    "references",
    "returns"
  ]);
  expect(result.edges.filter((edge) =>
    edge.resolution === "exact" &&
    relationKinds.has(edge.kind) &&
    filePaths.includes(edge.filePath)
  )).toEqual([]);
}

function expectNoExactCallsFrom(
  result: GraphSnapshot,
  filePaths: readonly string[],
  referenceNames: readonly string[]
): void {
  expect(result.edges.filter((edge) =>
    edge.resolution === "exact" &&
    edge.kind === "calls" &&
    filePaths.includes(edge.filePath) &&
    referenceNames.includes(edge.referenceName ?? "")
  )).toEqual([]);
}

const SIGNATURE_POSITIVE: FixtureFiles = {
  "src/api/Request.java": "package api; public class Request {}\n",
  "src/api/Result.java": "package api; public interface Result {}\n",
  "src/app/Local.java": "package app; public class Local {}\n",
  "src/app/Service.java": [
    "package app;",
    "import api.Request;",
    "import api.Result;",
    "public class Service {",
    "  public Service(Request request) {}",
    "  public Result execute(Request request) { return null; }",
    "  public api.Result qualified(api.Request request) { return null; }",
    "  public Local local(Local value) { return value; }",
    "}"
  ].join("\n")
};

const SIGNATURE_NEGATIVE: FixtureFiles = {
  "src/api/Request.java": "package api; public class Request {}\n",
  "src/api/Result.java": "package api; public interface Result {}\n",
  "src/bad/Wildcard.java": [
    "package bad;",
    "import api.*;",
    "public class Wildcard { public Result run(Request request) { return null; } }"
  ].join("\n"),
  "src/bad/Unimported.java": [
    "package bad;",
    "public class Unimported { public Result run(Request request) { return null; } }"
  ].join("\n")
};

const INSTANTIATION_POSITIVE: FixtureFiles = {
  "src/app/Service.java": "package app; public class Service<T> {}\n",
  "src/app/Runner.java": [
    "package app;",
    "public class Runner {",
    "  void run(Object value) {",
    "    Service<String> created = new Service<>();",
    "    if (value instanceof String text) { System.out.println(text); }",
    "  }",
    "}"
  ].join("\n")
};

const INSTANTIATION_NEGATIVE: FixtureFiles = {
  "src/app/ServiceA.java": "package app; class Service {}\n",
  "src/app/ServiceB.java": "package app; class Service {}\n",
  "src/app/Runner.java": [
    "package app;",
    "public class Runner {",
    "  void run(Object value) {",
    "    new Service<>();",
    "    if (value instanceof String text) { System.out.println(text); }",
    "  }",
    "}"
  ].join("\n")
};

const CALL_POSITIVE: FixtureFiles = {
  "src/api/BaseService.java": "package api; public class BaseService { public void run() {} }\n",
  "src/api/Box.java": "package api; public class Box<T> { public void run() {} }\n",
  "src/api/ConcreteService.java": "package api; public class ConcreteService extends BaseService {}\n",
  "src/api/Worker.java": "package api; public class Worker { public void handle() {} }\n",
  "src/app/Runner.java": [
    "package app;",
    "import api.BaseService;",
    "import api.Box;",
    "import api.ConcreteService;",
    "import api.Worker;",
    "public class Runner {",
    "  private final Worker fieldWorker;",
    "  public Runner(Worker worker) { this.fieldWorker = worker; }",
    "  private static void staticHelper() {}",
    "  private void instanceHelper() {}",
    "  static void bare(Object value) {",
    "    if (value instanceof String text) { System.out.println(text); }",
    "    staticHelper();",
    "  }",
    "  void parameter(Worker worker, Object value) {",
    "    if (value instanceof String text) { System.out.println(text); }",
    "    worker.handle();",
    "  }",
    "  void field(Object value) {",
    "    switch (value) {",
    "      case String text -> fieldWorker.handle();",
    "      default -> {}",
    "    }",
    "  }",
    "  void local(Object value) {",
    "    switch (value) {",
    "      case String text -> {",
    "        final Worker localWorker = new Worker();",
    "        localWorker.handle();",
    "      }",
    "      default -> {}",
    "    }",
    "  }",
    "  void widened(Object value) {",
    "    switch (value) {",
    "      case String text -> {",
    "        BaseService service = new ConcreteService();",
    "        service.run();",
    "      }",
    "      default -> {}",
    "    }",
    "  }",
    "  void generic(Object value) {",
    "    switch (value) {",
    "      case String text -> {",
    "        var box = new Box<String>();",
    "        box.run();",
    "      }",
    "      default -> {}",
    "    }",
    "  }",
    "  void instance(Object value) {",
    "    if (value instanceof String text) { System.out.println(text); }",
    "    instanceHelper();",
    "  }",
    "}"
  ].join("\n")
};

const CALL_NEGATIVE: FixtureFiles = {
  "src/api/Worker.java": "package api; public class Worker { public void handle() {} }\n",
  "src/bad/Ambiguous.java": [
    "package bad;",
    "public class Ambiguous {",
    "  private static void helper(int value) {}",
    "  private static void helper(long value) {}",
    "  static void entry(Object value) {",
    "    if (value instanceof String text) { System.out.println(text); }",
    "    helper(1);",
    "  }",
    "}"
  ].join("\n"),
  "src/bad/Runner.java": [
    "package bad;",
    "import api.Worker;",
    "public class Runner {",
    "  void consume(Worker value) {}",
    "  void parameter(Worker worker, Object value) {",
    "    if (value instanceof String text) { System.out.println(text); }",
    "    worker = new Worker();",
    "    worker.handle();",
    "  }",
    "  private final Worker fieldWorker;",
    "  Runner(Worker worker) { this.fieldWorker = worker; }",
    "  void field(Object value) {",
    "    switch (value) {",
    "      case String text -> { consume(fieldWorker); fieldWorker.handle(); }",
    "      default -> {}",
    "    }",
    "  }",
    "  void local(Object value) {",
    "    switch (value) {",
    "      case String text -> {",
    "        var localWorker = new Worker();",
    "        consume(localWorker);",
    "        localWorker.handle();",
    "      }",
    "      default -> {}",
    "    }",
    "  }",
    "}"
  ].join("\n")
};

const CHAIN_POSITIVE: FixtureFiles = {
  "src/api/Executor.java": "package api; public class Executor { public void execute() {} }\n",
  "src/app/Runner.java": [
    "package app;",
    "import factory.Factory;",
    "public class Runner { public void run() { Factory.create().execute(); } }"
  ].join("\n"),
  "src/factory/Factory.java": [
    "package factory;",
    "import api.Executor;",
    "public class Factory { public static Executor create() { return null; } }"
  ].join("\n")
};

const CHAIN_NEGATIVE: FixtureFiles = {
  "src/api/Executor.java": "package api; public class Executor { public void execute() {} }\n",
  "src/bad/InstanceFactory.java": [
    "package bad;",
    "import api.Executor;",
    "public class InstanceFactory { public Executor create() { return null; } }"
  ].join("\n"),
  "src/bad/InstanceRunner.java": "package bad; public class InstanceRunner { public void run() { InstanceFactory.create().execute(); } }",
  "src/bad/ShadowRunner.java": [
    "package bad;",
    "import factory.Factory;",
    "public class ShadowRunner {",
    "  public void run(Object Factory) { Factory.create().execute(); }",
    "}"
  ].join("\n"),
  "src/bad/SameArityExecutor.java": [
    "package bad;",
    "public class SameArityExecutor {",
    "  public void execute(String value) {}",
    "  public void execute(Integer value) {}",
    "}"
  ].join("\n"),
  "src/bad/SameArityExecutorFactory.java": [
    "package bad;",
    "public class SameArityExecutorFactory {",
    "  public static SameArityExecutor create() { return null; }",
    "}"
  ].join("\n"),
  "src/bad/SameArityRunner.java": [
    "package bad;",
    "public class SameArityRunner {",
    "  public void run() { SameArityExecutorFactory.create().execute(\"value\"); }",
    "}"
  ].join("\n"),
  "src/bad/WildcardRunner.java": [
    "package bad;",
    "import factory.*;",
    "public class WildcardRunner { public void run() { Factory.create().execute(); } }"
  ].join("\n"),
  "src/factory/Factory.java": "package factory; public class Factory { public static api.Executor create() { return null; } }\n"
};

const DI_POSITIVE: FixtureFiles = {
  "src/java/app/services/LegacyService.java": [
    "package app.services;",
    "public class LegacyService {}"
  ].join("\n"),
  "src/java/app/services/PetService.java": [
    "package app.services;",
    "public class PetService {}"
  ].join("\n"),
  "src/java/app/web/PetController.java": [
    "package app.web;",
    "import org.springframework.beans.factory.annotation.Autowired;",
    "import app.services.PetService;",
    "public class PetController {",
    "  @Autowired PetController(PetService pets) {}",
    "}"
  ].join("\n"),
  "src/java/app/web/QualifiedController.java": [
    "package app.web;",
    "public class QualifiedController {",
    "  @javax.inject.Inject QualifiedController(app.services.LegacyService legacy) {}",
    "}"
  ].join("\n"),
  "src/java/app/web/ResourceController.java": [
    "package app.web;",
    "import jakarta.annotation.Resource;",
    "import app.services.PetService;",
    "import app.services.LegacyService;",
    "public class ResourceController {",
    "  @Resource PetService pets;",
    "  @Resource() void setLegacy(LegacyService legacy) {}",
    "  @Resource void update(PetService ignored) {}",
    "  @Resource(name = \"named\") PetService named;",
    "}"
  ].join("\n"),
  "src/java/app/web/SetterController.java": [
    "package app.web;",
    "import org.springframework.beans.factory.annotation.Autowired;",
    "import app.services.LegacyService;",
    "import app.services.PetService;",
    "public class SetterController {",
    "  @Autowired void setServices(LegacyService legacy, PetService pets) {}",
    "}"
  ].join("\n")
};

const DI_NEGATIVE: FixtureFiles = {
  "src/app/Consumer.java": [
    "package app;",
    "import jakarta.inject.Inject;",
    "import app.services.PetService;",
    "public class Consumer {",
    "  @Inject PetService service;",
    "  @Inject app.services.MissingService missing;",
    "}"
  ].join("\n"),
  "src/services/One.java": "package app.services; class PetService {}\n",
  "src/services/Two.java": "package app.services; class PetService {}\n"
};

describe("Java callable/project resolver pre-move parity golden", () => {
  it("preserves complete signature output and evidence", () => {
    const result = resolveFixture(SIGNATURE_POSITIVE);
    for (const expected of [
      ["src/app/Service.java", "Service", "accepts", "src/api/Request.java", "Request", "signature.java.explicit-import.accepts"],
      ["src/app/Service.java", "Service.execute", "accepts", "src/api/Request.java", "Request", "signature.java.explicit-import.accepts"],
      ["src/app/Service.java", "Service.execute", "returns", "src/api/Result.java", "Result", "signature.java.explicit-import.returns"],
      ["src/app/Service.java", "Service.qualified", "accepts", "src/api/Request.java", "Request", "signature.java.qualified-type.accepts"],
      ["src/app/Service.java", "Service.qualified", "returns", "src/api/Result.java", "Result", "signature.java.qualified-type.returns"],
      ["src/app/Service.java", "Service.local", "accepts", "src/app/Local.java", "Local", "signature.java.same-package.accepts"],
      ["src/app/Service.java", "Service.local", "returns", "src/app/Local.java", "Local", "signature.java.same-package.returns"]
    ] as const) {
      const [sourceFilePath, sourceName, kind, targetFilePath, targetName, ruleId] = expected;
      expectExactEdge(result, {
        sourceFilePath,
        sourceName,
        sourceKind: "method",
        targetFilePath,
        targetName,
        targetKind: targetName === "Result" ? "interface" : "class",
        kind,
        ruleId
      });
    }
    expect(result).toMatchSnapshot();
  });

  it("keeps wildcard and unimported signature targets unresolved", () => {
    const result = resolveFixture(SIGNATURE_NEGATIVE);
    expectNoExactEdgesFrom(result, ["src/bad/Wildcard.java", "src/bad/Unimported.java"]);
    expect(result).toMatchSnapshot();
  });

  it("preserves direct generic object creation output and evidence", () => {
    const result = resolveFixture(INSTANTIATION_POSITIVE);
    expectExactEdge(result, {
      sourceFilePath: "src/app/Runner.java",
      sourceName: "Runner.run",
      sourceKind: "method",
      targetFilePath: "src/app/Service.java",
      targetName: "Service",
      targetKind: "class",
      kind: "instantiates",
      ruleId: "syntax.java.object-creation.same-package"
    });
    expect(result).toMatchSnapshot();
  });

  it("keeps ambiguous object creation unresolved", () => {
    const result = resolveFixture(INSTANTIATION_NEGATIVE);
    expectNoExactEdgesFrom(result, ["src/app/Runner.java"]);
    expect(result).toMatchSnapshot();
  });

  it("preserves direct, parameter, field, local, inherited, and generic call output", () => {
    const result = resolveFixture(CALL_POSITIVE);
    for (const expected of [
      ["src/app/Runner.java", "Runner.bare", "src/app/Runner.java", "Runner.staticHelper", "call.java.member.implicit-static.arity.direct-dispatch"],
      ["src/app/Runner.java", "Runner.instance", "src/app/Runner.java", "Runner.instanceHelper", "call.java.member.implicit-instance.private-binding.arity.direct-dispatch"],
      ["src/app/Runner.java", "Runner.parameter", "src/api/Worker.java", "Worker.handle", "call.java.member.parameter.arity.direct-dispatch"],
      ["src/app/Runner.java", "Runner.field", "src/api/Worker.java", "Worker.handle", "call.java.member.field.arity.direct-dispatch"],
      ["src/app/Runner.java", "Runner.local", "src/api/Worker.java", "Worker.handle", "call.java.member.local.arity.direct-dispatch"],
      ["src/app/Runner.java", "Runner.widened", "src/api/BaseService.java", "BaseService.run", "call.java.member.local.arity.direct-dispatch"],
      ["src/app/Runner.java", "Runner.generic", "src/api/Box.java", "Box.run", "call.java.member.local.arity.direct-dispatch"]
    ] as const) {
      const [sourceFilePath, sourceName, targetFilePath, targetName, ruleId] = expected;
      expectExactEdge(result, { sourceFilePath, sourceName, sourceKind: "method", targetFilePath, targetName, targetKind: "method", kind: "calls", ruleId });
    }
    for (const expected of [
      ["src/app/Runner.java", "Runner.local", "src/api/Worker.java", "Worker", "syntax.java.object-creation.explicit-import"],
      ["src/app/Runner.java", "Runner.widened", "src/api/ConcreteService.java", "ConcreteService", "syntax.java.object-creation.explicit-import"],
      ["src/app/Runner.java", "Runner.generic", "src/api/Box.java", "Box", "syntax.java.object-creation.explicit-import"]
    ] as const) {
      const [sourceFilePath, sourceName, targetFilePath, targetName, ruleId] = expected;
      expectExactEdge(result, { sourceFilePath, sourceName, sourceKind: "method", targetFilePath, targetName, targetKind: "class", kind: "instantiates", ruleId });
    }
    expect(result).toMatchSnapshot();
  });

  it("keeps ambiguous, escaped, and reassigned receivers unresolved", () => {
    const result = resolveFixture(CALL_NEGATIVE);
    expectNoExactCallsFrom(result, ["src/bad/Ambiguous.java", "src/bad/Runner.java"], ["helper", "handle"]);
    expect(result).toMatchSnapshot();
  });

  it("preserves static-factory chain calls and complete dispatch evidence", () => {
    const result = resolveFixture(CHAIN_POSITIVE);
    expectExactEdge(result, {
      sourceFilePath: "src/app/Runner.java",
      sourceName: "Runner.run",
      sourceKind: "method",
      targetFilePath: "src/factory/Factory.java",
      targetName: "Factory.create",
      targetKind: "method",
      kind: "calls",
      ruleId: "call.java.chained-factory.explicit-import.arity.factory"
    });
    expectExactEdge(result, {
      sourceFilePath: "src/app/Runner.java",
      sourceName: "Runner.run",
      sourceKind: "method",
      targetFilePath: "src/api/Executor.java",
      targetName: "Executor.execute",
      targetKind: "method",
      kind: "calls",
      ruleId: "call.java.chained-factory.explicit-import.arity.return-dispatch"
    });
    expect(result).toMatchSnapshot();
  });

  it("keeps unsafe static-factory chain shapes unresolved", () => {
    const result = resolveFixture(CHAIN_NEGATIVE);
    expectNoExactEdgesFrom(result, [
      "src/bad/InstanceRunner.java",
      "src/bad/ShadowRunner.java",
      "src/bad/SameArityRunner.java",
      "src/bad/WildcardRunner.java"
    ]);
    expect(result).toMatchSnapshot();
  });

  it("preserves Java DI source edges and evidence", () => {
    const result = resolveFixture(DI_POSITIVE);
    for (const expected of [
      ["src/java/app/web/PetController.java", "PetController", "src/java/app/services/PetService.java", "PetService", "framework.jvm-di.spring-autowired-constructor.explicit-import.local-type"],
      ["src/java/app/web/QualifiedController.java", "QualifiedController", "src/java/app/services/LegacyService.java", "LegacyService", "framework.jvm-di.javax-inject-constructor.qualified-type.local-type"],
      ["src/java/app/web/SetterController.java", "SetterController", "src/java/app/services/LegacyService.java", "LegacyService", "framework.jvm-di.spring-autowired-method.explicit-import.local-type"],
      ["src/java/app/web/SetterController.java", "SetterController", "src/java/app/services/PetService.java", "PetService", "framework.jvm-di.spring-autowired-method.explicit-import.local-type"],
      ["src/java/app/web/ResourceController.java", "ResourceController", "src/java/app/services/PetService.java", "PetService", "framework.jvm-di.jakarta-resource-field.explicit-import.local-type"],
      ["src/java/app/web/ResourceController.java", "ResourceController", "src/java/app/services/LegacyService.java", "LegacyService", "framework.jvm-di.jakarta-resource-setter.explicit-import.local-type"]
    ] as const) {
      const [sourceFilePath, sourceName, targetFilePath, targetName, ruleId] = expected;
      expectExactEdge(result, { sourceFilePath, sourceName, sourceKind: "class", targetFilePath, targetName, targetKind: "class", kind: "references", ruleId });
    }
    expect(result).toMatchSnapshot();
  });

  it("keeps missing and ambiguous DI types unresolved", () => {
    const result = resolveFixture(DI_NEGATIVE);
    expectNoExactEdgesFrom(result, ["src/app/Consumer.java"]);
    expect(result).toMatchSnapshot();
  });
});
