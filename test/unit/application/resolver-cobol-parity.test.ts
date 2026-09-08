import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";

type CobolFixtureFiles = Readonly<Record<string, string>>;

const POSITIVE_FILES: CobolFixtureFiles = {
  "cobol/Caller.cbl": [
    "       IDENTIFICATION DIVISION.",
    "       PROGRAM-ID. CALLER.",
    "       PROCEDURE DIVISION.",
    "       MAIN-LOGIC.",
    "           EXEC CICS RETURN",
    "             TRANSID('NXT1')",
    "           END-EXEC.",
    "       AMBIGUOUS-LOGIC.",
    "           EXEC CICS START TRANSID('DUP1') END-EXEC.",
    "       MISSING-LOGIC.",
    "           EXEC CICS RETURN TRANSID('MISS') END-EXEC.",
    "       END PROGRAM CALLER."
  ].join("\n"),
  "cobol/Next.cbl": [
    "       IDENTIFICATION DIVISION.",
    "       PROGRAM-ID. NEXT-PROGRAM.",
    "       DATA DIVISION.",
    "       WORKING-STORAGE SECTION.",
    "       01 WS-TRANID PIC X(04) VALUE 'NXT1'.",
    "       PROCEDURE DIVISION.",
    "       MAIN-LOGIC.",
    "           GOBACK.",
    "       END PROGRAM NEXT-PROGRAM."
  ].join("\n"),
  "cobol/DuplicateLeft.cbl": [
    "       IDENTIFICATION DIVISION.",
    "       PROGRAM-ID. DUPLICATE-LEFT.",
    "       DATA DIVISION.",
    "       WORKING-STORAGE SECTION.",
    "       01 WS-TRANSACTION PIC X(04) VALUE 'DUP1'.",
    "       PROCEDURE DIVISION.",
    "       MAIN-LOGIC.",
    "           GOBACK.",
    "       END PROGRAM DUPLICATE-LEFT."
  ].join("\n"),
  "cobol/DuplicateRight.cbl": [
    "       IDENTIFICATION DIVISION.",
    "       PROGRAM-ID. DUPLICATE-RIGHT.",
    "       DATA DIVISION.",
    "       WORKING-STORAGE SECTION.",
    "       01 WS-TRANSACTION PIC X(04) VALUE 'DUP1'.",
    "       PROCEDURE DIVISION.",
    "       MAIN-LOGIC.",
    "           GOBACK.",
    "       END PROGRAM DUPLICATE-RIGHT."
  ].join("\n")
};

function sourceDocuments(files: CobolFixtureFiles): readonly SourceDocument[] {
  return Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/cobol-resolver-parity/${relativePath}`,
    language: "cobol",
    sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
}

function resolveFixture(files: CobolFixtureFiles) {
  const documents = sourceDocuments(files);
  return resolveProjectFacts({
    sourceDocuments: documents,
    extractedFiles: documents.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language
      })
    ),
    indexedAt: INDEXED_AT
  });
}

function cicsEdges(result: ReturnType<typeof resolveFixture>) {
  return result.edges.filter((edge) => edge.referenceName?.startsWith("cics-transid:") === true);
}

describe("COBOL CICS resolver pre-move parity golden", () => {
  it("preserves unique, ambiguous, and missing transaction-owner output", () => {
    const result = resolveFixture(POSITIVE_FILES);
    const nextProgram = result.symbols.find(
      (symbol) => symbol.qualifiedName === "cobol/Next.cbl#program:NEXT-PROGRAM"
    );
    expect(nextProgram).toBeDefined();

    const uniqueHop = cicsEdges(result).find((edge) => edge.referenceName === "cics-transid:NXT1");
    expect(uniqueHop).toMatchObject({
      targetId: nextProgram?.id,
      kind: "calls",
      resolution: "heuristic",
      confidence: 0.85,
      evidence: {
        ruleId: "framework.cics.literal-transid.unique-program-owner",
        stage: "heuristic",
        candidateSymbolIds: [nextProgram?.id]
      }
    });

    expect(cicsEdges(result)).toHaveLength(3);
    expect(
      result.pendingReferences
        .map((reference) => reference.referenceName)
        .filter((name) => name.startsWith("cics-transid:"))
    ).toEqual(["cics-transid:DUP1", "cics-transid:MISS"]);
    expect(result).toMatchSnapshot();
  });

  it("preserves consumer-only transaction nonclaims without owner files", () => {
    const result = resolveFixture({ "cobol/Caller.cbl": POSITIVE_FILES["cobol/Caller.cbl"]! });
    const edges = cicsEdges(result);

    expect(edges).toHaveLength(3);
    expect(edges.every((edge) => edge.targetId === null && edge.resolution === "unresolved")).toBe(true);
    expect(
      result.pendingReferences
        .map((reference) => reference.referenceName)
        .filter((name) => name.startsWith("cics-transid:"))
    ).toEqual(["cics-transid:DUP1", "cics-transid:NXT1", "cics-transid:MISS"]);
    expect(result).toMatchSnapshot();
  });
});
