import { describe, expect, it } from "vitest";

import { renderInvestigationDeclaration } from "../../src/application/context-rendering.js";
import {
  MCP_INVESTIGATE_SOURCE_SESSION_POLICY,
  McpInvestigateSourceSession
} from "../../src/mcp/investigate-session-source.js";

function response(
  projectPath = "C:/project",
  generationId = "generation:one",
  sourceText = [
    "export function answer(value: string): string {",
    ...Array.from({ length: 12 }, (_value, index) => `  const padding${index} = value;`),
    '  return "needleEvidence";',
    "}"
  ].join("\n")
) {
  const reference = "src/answer.ts#answer";
  const rendered = renderInvestigationDeclaration({
    sourceText,
    allocatedCharacters: 120,
    declarationRange: {
      start: { line: 1, column: 1 },
      end: { line: 15, column: 2 }
    },
    lexicalFocusRange: { start: { line: 14, column: 11 }, end: { line: 14, column: 25 } },
    language: "typescript",
    requestedMode: "multi",
    filePath: "src/answer.ts",
    declarationReference: reference
  });
  const structuredContent = {
    status: { projectPath, generationId },
    declarations: [{
      reference,
      sourceAvailability: "active-generation",
      source: {
        filePath: "src/answer.ts",
        range: {
          start: { line: 1, column: 1 },
          end: { line: 15, column: 2 }
        },
        text: rendered.text,
        totalLines: 15,
        totalCharacters: sourceText.length,
        truncated: true,
        renderedRange: rendered.renderedRange,
        renderedCharacterOffsets: rendered.receipt.sourceCharacterOffsets,
        renderedSegments: rendered.segments,
        primarySegmentIndex: rendered.primarySegmentIndex
      },
      allocation: null,
      render: rendered.receipt
    }]
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

function projected(response_: ReturnType<typeof response>) {
  return response_.structuredContent as typeof response_.structuredContent & {
    sessionSource: {
      policy: typeof MCP_INVESTIGATE_SOURCE_SESSION_POLICY;
      mode: "deduplicate" | "full";
      projectPath: string;
      generationId: string;
      callIndex: number;
      generationReset: boolean;
      summary: {
        candidateSegments: number;
        emittedSegments: number;
        referencedSegments: number;
        emittedCharacters: number;
        avoidedCharacters: number;
        stateSegmentsAfterCall: number;
        stateTruncated: boolean;
      };
    };
  };
}

describe("MCP investigate session source delivery", () => {
  it("replaces only byte-identical segments from an earlier call with explicit back-references", () => {
    const session = new McpInvestigateSourceSession();
    const firstResponse = session.project(response(), "deduplicate");
    const secondResponse = session.project(response(), "deduplicate");
    const first = projected(firstResponse as ReturnType<typeof response>);
    const second = projected(secondResponse as ReturnType<typeof response>);
    const firstSegments = first.declarations[0]!.source!.renderedSegments;
    const secondSegments = second.declarations[0]!.source!.renderedSegments as Array<{
      text?: string;
      id: string;
      contentSha256: string;
      delivery: {
        status: "already-served";
        firstDeliveredCallIndex: number;
        message: string;
      };
    }>;

    expect(first.sessionSource).toMatchObject({
      policy: MCP_INVESTIGATE_SOURCE_SESSION_POLICY,
      mode: "deduplicate",
      projectPath: "C:/project",
      generationId: "generation:one",
      callIndex: 1,
      generationReset: false,
      summary: {
        candidateSegments: 2,
        emittedSegments: 2,
        referencedSegments: 0,
        avoidedCharacters: 0,
        stateSegmentsAfterCall: 2
      }
    });
    expect(second.sessionSource).toMatchObject({
      callIndex: 2,
      generationReset: false,
      summary: {
        candidateSegments: 2,
        emittedSegments: 0,
        referencedSegments: 2,
        emittedCharacters: 0,
        stateSegmentsAfterCall: 2
      }
    });
    expect(second.sessionSource.summary.avoidedCharacters).toBe(
      firstSegments.reduce((total, segment) => total + segment.text.length, 0)
    );
    expect(second.declarations[0]!.source!.text).toBeNull();
    expect(secondSegments).toHaveLength(2);
    expect(secondSegments.every((segment) => segment.text === undefined)).toBe(true);
    expect(secondSegments.map((segment) => segment.delivery)).toEqual([
      expect.objectContaining({
        status: "already-served",
        firstDeliveredCallIndex: 1,
        message: expect.stringContaining("already delivered in this MCP session")
      }),
      expect.objectContaining({
        status: "already-served",
        firstDeliveredCallIndex: 1,
        message: expect.stringContaining("already delivered in this MCP session")
      })
    ]);
    expect(secondResponse.content[0]!.text).not.toContain("needleEvidence");
  });

  it("re-emits after a generation change and when the caller explicitly requests full delivery", () => {
    const session = new McpInvestigateSourceSession();
    session.project(response(), "deduplicate");

    const nextGeneration = projected(
      session.project(response("C:/project", "generation:two"), "deduplicate") as ReturnType<typeof response>
    );
    const forced = projected(
      session.project(response("C:/project", "generation:two"), "full") as ReturnType<typeof response>
    );

    expect(nextGeneration.sessionSource).toMatchObject({
      callIndex: 2,
      generationReset: true,
      summary: { emittedSegments: 2, referencedSegments: 0 }
    });
    expect(nextGeneration.declarations[0]!.source!.text).toContain("needleEvidence");
    expect(forced.sessionSource).toMatchObject({
      mode: "full",
      callIndex: 3,
      generationReset: false,
      summary: { emittedSegments: 2, referencedSegments: 0, avoidedCharacters: 0 }
    });
  });

  it("isolates projects, evicts only bounded detail, and safely re-emits after eviction", () => {
    const session = new McpInvestigateSourceSession({
      maximumProjects: 2,
      maximumSegmentsPerProject: 4
    });

    session.project(response("C:/one"), "deduplicate");
    session.project(response("C:/two"), "deduplicate");
    const third = projected(
      session.project(response("C:/three"), "deduplicate") as ReturnType<typeof response>
    );
    const revisited = projected(
      session.project(response("C:/one"), "deduplicate") as ReturnType<typeof response>
    );

    expect(third.sessionSource.summary.stateTruncated).toBe(true);
    expect(revisited.sessionSource).toMatchObject({
      projectPath: "C:/one",
      callIndex: 1,
      summary: { emittedSegments: 2, referencedSegments: 0, stateTruncated: true }
    });
  });

  it("fails open when the per-project segment bound evicts earlier delivery evidence", () => {
    const session = new McpInvestigateSourceSession({ maximumSegmentsPerProject: 1 });

    const first = projected(
      session.project(response(), "deduplicate") as ReturnType<typeof response>
    );
    const second = projected(
      session.project(response(), "deduplicate") as ReturnType<typeof response>
    );

    expect(first.sessionSource.summary).toMatchObject({
      candidateSegments: 2,
      emittedSegments: 2,
      referencedSegments: 0,
      stateSegmentsAfterCall: 1,
      stateTruncated: true
    });
    expect(second.sessionSource.summary).toMatchObject({
      emittedSegments: 2,
      referencedSegments: 0,
      stateSegmentsAfterCall: 1,
      stateTruncated: true
    });
    expect(second.declarations[0]!.source!.text).toContain("needleEvidence");
  });

  it("does not suppress source when segment identity cannot be proven", () => {
    const session = new McpInvestigateSourceSession();
    const malformed = response();
    malformed.structuredContent.declarations[0]!.source!.renderedSegments[0] = {
      ...malformed.structuredContent.declarations[0]!.source!.renderedSegments[0]!,
      id: "segment:not-a-valid-identity"
    };

    const first = session.project(malformed, "deduplicate");
    const second = session.project(malformed, "deduplicate");

    expect(first).toEqual(malformed);
    expect(second).toEqual(malformed);
  });
});
