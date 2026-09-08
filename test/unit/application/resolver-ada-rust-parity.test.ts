import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import type { GraphEdge } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

type ExpectedEdge = {
  readonly kind: GraphEdge["kind"];
  readonly ruleId: string;
  readonly sourceFilePath: string;
  readonly targetFilePath: string;
  readonly referenceName?: string;
};

type ParityCase = {
  readonly language: "ada" | "rust";
  readonly files: Readonly<Record<string, string>>;
  readonly consumerPath: string;
  readonly expectedCrossFileEdges: readonly ExpectedEdge[];
  readonly expectedLocalEdges: readonly ExpectedEdge[];
};

// These are deliberately small representatives of the existing Ada and Rust
// integration fixtures. The snapshots are frozen before the resolver move;
// they are a mechanical parity oracle, not an independent compiler truth set.
const cases: readonly ParityCase[] = [
  {
    language: "ada",
    consumerPath: "src/local.adb",
    files: {
      "src/ada_entry.adb": [
        "with adaHelper;",
        "procedure adaEntry is",
        "begin",
        "  adaHelper (1, 2);",
        "end adaEntry;"
      ].join("\n"),
      "src/ada_helper.adb": [
        "procedure adaHelper (Left : Integer; Right : Integer) is",
        "begin",
        "  null;",
        "end adaHelper;"
      ].join("\n"),
      "src/local.adb": [
        "with localHelper;",
        "procedure localEntry is",
        "begin",
        "  localHelper (3, 4);",
        "end localEntry;",
        "procedure localHelper (Left : Integer; Right : Integer) is",
        "begin",
        "  null;",
        "end localHelper;"
      ].join("\n"),
      "src/result.ads": [
        "generic",
        "  type Item is private;",
        "package Result is",
        "end Result;"
      ].join("\n"),
      "src/result.adb": [
        "package body Result is",
        "end Result;"
      ].join("\n")
    },
    expectedCrossFileEdges: [
      {
        kind: "calls",
        ruleId: "project.ada.unique-procedure.fixed-arity-call",
        sourceFilePath: "src/ada_entry.adb",
        targetFilePath: "src/ada_helper.adb",
        referenceName: "adaHelper"
      },
      {
        kind: "references",
        ruleId: "project.ada.root-library-package-body.unique-specification",
        sourceFilePath: "src/result.adb",
        targetFilePath: "src/result.ads",
        referenceName: "Result"
      }
    ],
    expectedLocalEdges: [
      {
        kind: "calls",
        ruleId: "syntax.ada.same-file.unique-fixed-arity-procedure-call.direct-context-with",
        sourceFilePath: "src/local.adb",
        targetFilePath: "src/local.adb",
        referenceName: "localHelper"
      }
    ]
  },
  {
    language: "rust",
    consumerPath: "src/local.rs",
    files: {
      "src/lib.rs": [
        "pub mod service;",
        "pub mod caller;",
        "pub mod local;",
        "pub trait Worker { fn run(&self); }",
        "pub enum Kind { Unit }"
      ].join("\n") + "\n",
      "src/service.rs": [
        "use crate::Worker;",
        "pub struct Service { pub value: i32 }",
        "impl Service {",
        "  pub fn new() -> Self { Service { value: 0 } }",
        "  pub fn run(&self) {}",
        "}",
        "impl Worker for Service { fn run(&self) {} }"
      ].join("\n") + "\n",
      "src/caller.rs": [
        "use crate::service::Service;",
        "pub fn caller() {",
        "  let service: Service = Service::new();",
        "  service.run();",
        "  let _copy = Service { value: 1 };",
        "  let _kind = crate::Kind::Unit;",
        "}",
        "pub fn trait_caller(worker: &dyn crate::Worker) { worker.run(); }"
      ].join("\n") + "\n",
      "src/local.rs": [
        "pub struct Local;",
        "impl Local {",
        "  pub fn new() -> Self { Local }",
        "  pub fn run(&self) {}",
        "}",
        "pub fn local_caller() {",
        "  let local: Local = Local::new();",
        "  local.run();",
        "  let _value = Local {};",
        "}"
      ].join("\n") + "\n"
    },
    expectedCrossFileEdges: [
      {
        kind: "imports",
        ruleId: "project.rust.crate.direct-module.named-import-file",
        sourceFilePath: "src/caller.rs",
        targetFilePath: "src/service.rs",
        referenceName: "crate::service::Service"
      },
      {
        kind: "calls",
        ruleId: "project.rust.impl.unique-inherent-associated-function-call",
        sourceFilePath: "src/caller.rs",
        targetFilePath: "src/service.rs",
        referenceName: "new"
      },
      {
        kind: "calls",
        ruleId: "project.rust.impl.unique-inherent-method-call",
        sourceFilePath: "src/caller.rs",
        targetFilePath: "src/service.rs",
        referenceName: "run"
      },
      {
        kind: "instantiates",
        ruleId: "project.rust.type.unique-construction",
        sourceFilePath: "src/caller.rs",
        targetFilePath: "src/service.rs",
        referenceName: "Service"
      },
      {
        kind: "instantiates",
        ruleId: "project.rust.type.unique-construction",
        sourceFilePath: "src/caller.rs",
        targetFilePath: "src/lib.rs",
        referenceName: "Kind"
      },
      {
        kind: "implements",
        ruleId: "project.rust.impl.unique-trait",
        sourceFilePath: "src/service.rs",
        targetFilePath: "src/lib.rs",
        referenceName: "Worker"
      }
    ],
    expectedLocalEdges: [
      {
        kind: "calls",
        ruleId: "project.rust.impl.unique-inherent-associated-function-call",
        sourceFilePath: "src/local.rs",
        targetFilePath: "src/local.rs",
        referenceName: "new"
      },
      {
        kind: "calls",
        ruleId: "project.rust.impl.unique-inherent-method-call",
        sourceFilePath: "src/local.rs",
        targetFilePath: "src/local.rs",
        referenceName: "run"
      },
      {
        kind: "instantiates",
        ruleId: "project.rust.type.unique-construction",
        sourceFilePath: "src/local.rs",
        targetFilePath: "src/local.rs",
        referenceName: "Local"
      }
    ]
  }
];

function resolveFixture(
  language: SourceDocument["language"],
  files: Readonly<Record<string, string>>
) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/resolver-ada-rust-parity/${relativePath}`,
    language,
    sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) => extractFileFacts({
      filePath: document.relativePath,
      sourceText: document.sourceText,
      language: document.language
    })),
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
}

function exactEdges(result: ReturnType<typeof resolveFixture>): readonly GraphEdge[] {
  return result.edges.filter((edge) => edge.resolution === "exact" && edge.confidence === 1);
}

function filePathFor(
  result: ReturnType<typeof resolveFixture>,
  symbolId: string
): string | undefined {
  return result.symbols.find((symbol) => symbol.id === symbolId)?.filePath;
}

function edgeMatches(
  result: ReturnType<typeof resolveFixture>,
  edge: ExpectedEdge
): GraphEdge | undefined {
  return exactEdges(result).find((candidate) =>
    candidate.kind === edge.kind &&
    candidate.evidence?.ruleId === edge.ruleId &&
    filePathFor(result, candidate.sourceId) === edge.sourceFilePath &&
    filePathFor(result, candidate.targetId) === edge.targetFilePath &&
    (edge.referenceName === undefined || candidate.referenceName === edge.referenceName)
  );
}

function expectEdges(
  result: ReturnType<typeof resolveFixture>,
  expected: readonly ExpectedEdge[]
): void {
  for (const expectedEdge of expected) {
    const actual = edgeMatches(result, expectedEdge);
    expect(actual, `${expectedEdge.kind} ${expectedEdge.ruleId} ${expectedEdge.referenceName ?? ""}`).toBeDefined();
    expect(actual?.evidence?.candidateSymbolIds).toHaveLength(1);
    expect(actual?.evidence?.candidateSymbolIds[0]).toBe(actual?.targetId);
  }
}

function exactCrossFileEdges(result: ReturnType<typeof resolveFixture>): readonly GraphEdge[] {
  return exactEdges(result).filter((edge) => {
    const sourceFilePath = filePathFor(result, edge.sourceId);
    const targetFilePath = filePathFor(result, edge.targetId);
    return sourceFilePath !== undefined && targetFilePath !== undefined && sourceFilePath !== targetFilePath;
  });
}

function exactLocalEdges(result: ReturnType<typeof resolveFixture>): readonly GraphEdge[] {
  return exactEdges(result).filter((edge) => {
    const sourceFilePath = filePathFor(result, edge.sourceId);
    const targetFilePath = filePathFor(result, edge.targetId);
    return sourceFilePath !== undefined && sourceFilePath === targetFilePath;
  });
}

describe("Ada and Rust resolver pre-move parity golden", () => {
  it.each(cases)("$language preserves project and local/call relations", ({
    language,
    files,
    expectedCrossFileEdges,
    expectedLocalEdges
  }) => {
    const result = resolveFixture(language, files);
    expectEdges(result, expectedCrossFileEdges);
    expectEdges(result, expectedLocalEdges);
    expect(exactCrossFileEdges(result).length).toBeGreaterThan(0);
    expect(exactLocalEdges(result).length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });

  it.each(cases)("$language keeps consumer-only project targets unresolved", ({
    language,
    files,
    consumerPath,
    expectedLocalEdges
  }) => {
    const consumerSource = files[consumerPath];
    if (consumerSource === undefined) {
      throw new Error(`Missing consumer fixture: ${consumerPath}`);
    }
    const result = resolveFixture(language, { [consumerPath]: consumerSource });
    expect(exactCrossFileEdges(result)).toEqual([]);
    expectEdges(result, expectedLocalEdges);
    expect(exactLocalEdges(result).length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });
});
