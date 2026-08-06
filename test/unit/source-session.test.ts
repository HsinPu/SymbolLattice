import { describe, expect, it } from "vitest";

import {
  canonicalSourceDeliverySlice,
  sourceDeliveryIdentityFromText
} from "../../src/application/source-delivery.js";
import { McpSourceSession } from "../../src/mcp/source-session.js";

const text = "export const user = 1;";
const identity = sourceDeliveryIdentityFromText({
  filePath: "src/users.ts",
  text,
  fullFileCharacterOffsets: { start: 0, end: text.length }
});

function response(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

function status(generationId = "generation:1") {
  return { projectPath: "C:/project", generationId };
}

function nodeResponse(generationId = "generation:1") {
  return response({
    status: status(generationId),
    source: { filePath: "src/users.ts", text, sourceIdentity: identity }
  });
}

function investigateResponse(generationId = "generation:1") {
  return response({
    status: status(generationId),
    declarations: [{
      reference: "src/users.ts#user",
      source: {
        filePath: "src/users.ts",
        text,
        sourceIdentity: identity,
        primarySegmentIndex: 0,
        renderedSegments: [{ text, sourceIdentity: identity }]
      }
    }]
  });
}

function fileResponse(generationId = "generation:1") {
  return response({
    status: status(generationId),
    contentAvailability: "active-generation",
    selection: { filePath: "src/users.ts" },
    sourceIdentity: identity,
    lines: [{ line: 1, text }]
  });
}

function nodeSliceResponse(sourceText: string, start: number, end: number) {
  const deliveredText = sourceText.slice(start, end);
  return response({
    status: status(),
    source: {
      filePath: "src/intervals.ts",
      text: deliveredText,
      sourceIdentity: sourceDeliveryIdentityFromText({
        filePath: "src/intervals.ts",
        text: deliveredText,
        fullFileCharacterOffsets: { start, end }
      })
    }
  });
}

function fileSliceResponse(sourceText: string, start: number, end: number) {
  const deliveredText = sourceText.slice(start, end);
  return response({
    status: status(),
    contentAvailability: "active-generation",
    selection: { filePath: "src/intervals.ts" },
    sourceIdentity: sourceDeliveryIdentityFromText({
      filePath: "src/intervals.ts",
      text: deliveredText,
      fullFileCharacterOffsets: { start, end }
    }),
    lines: [{ line: 1, text: deliveredText }]
  });
}

function investigateSliceResponse(sourceText: string, start: number, end: number) {
  const deliveredText = sourceText.slice(start, end);
  const sourceIdentity = sourceDeliveryIdentityFromText({
    filePath: "src/intervals.ts",
    text: deliveredText,
    fullFileCharacterOffsets: { start, end }
  });
  return response({
    status: status(),
    declarations: [{
      reference: "src/intervals.ts#value",
      source: {
        filePath: "src/intervals.ts",
        text: deliveredText,
        sourceIdentity,
        primarySegmentIndex: 0,
        renderedSegments: [{ text: deliveredText, sourceIdentity }]
      }
    }]
  });
}

function pointerFixture() {
  const sourceText = [
    "export function userById() {",
    "  return 1;",
    "}"
  ].join("\n");
  const sourceIdentity = sourceDeliveryIdentityFromText({
    filePath: "src/users.ts",
    text: sourceText,
    fullFileCharacterOffsets: { start: 100, end: 100 + sourceText.length }
  });
  const symbol = {
    id: "symbol:users:userById",
    name: "userById",
    qualifiedName: "src/users.ts#userById",
    kind: "function",
    filePath: "src/users.ts",
    range: { start: { line: 12, column: 1 }, end: { line: 14, column: 2 } }
  };
  return {
    node: response({
      status: status(),
      match: { status: "exact", symbol },
      source: {
        filePath: "src/users.ts",
        text: sourceText,
        sourceIdentity,
        range: symbol.range,
        truncated: false
      }
    }),
    file: response({
      status: status(),
      contentAvailability: "active-generation",
      selection: { filePath: "src/users.ts" },
      sourceIdentity,
      lines: sourceText.split("\n").map((line, index) => ({ line: 12 + index, text: line })),
      symbols: [symbol]
    })
  };
}

describe("MCP source session", () => {
  it("projects stable file, line, and symbol pointers for exact back-references", () => {
    const fixture = pointerFixture();
    const session = new McpSourceSession();
    const first = session.project(fixture.node, "node", "deduplicate");
    const second = session.project(fixture.file, "file", "deduplicate");

    expect(first.structuredContent).toMatchObject({
      source: {
        delivery: {
          status: "emitted",
          pointer: {
            policy: "mcp-source-pointer-v1",
            filePath: "src/users.ts",
            lineSpan: { start: 12, end: 14 },
            symbols: [{ reference: "src/users.ts#userById", name: "userById", kind: "function" }],
            symbolsTruncated: false,
            display: "src/users.ts:L12-L14 (userById)"
          }
        }
      }
    });
    expect(second.structuredContent).toMatchObject({
      lines: [],
      sourceDelivery: {
        policy: "mcp-session-source-dedup-v5",
        status: "already-served",
        coveredPointers: [{
          filePath: "src/users.ts",
          lineSpan: { start: 12, end: 14 },
          display: "src/users.ts:L12-L14 (userById)"
        }],
        coveredBy: [{
          firstDeliveredTool: "node",
          pointer: { display: "src/users.ts:L12-L14 (userById)" }
        }]
      }
    });
  });

  it("keeps equality deduplication when display metadata cannot be proven", () => {
    const session = new McpSourceSession();
    const invalidFile = fileResponse();
    ((invalidFile.structuredContent.lines as Array<Record<string, unknown>>)[0]!).line = "invalid";
    const first = session.project(nodeResponse(), "node", "deduplicate");
    const second = session.project(invalidFile, "file", "deduplicate");

    expect(first.structuredContent).toMatchObject({
      source: { delivery: { status: "emitted" } }
    });
    expect(first.structuredContent).not.toHaveProperty("source.delivery.pointer");
    expect(second.structuredContent).toMatchObject({
      lines: [],
      sourceDelivery: { status: "already-served" }
    });
    expect(second.structuredContent).not.toHaveProperty("sourceDelivery.coveredPointers");
    expect(second.structuredContent).not.toHaveProperty("sourceDelivery.coveredBy.0.pointer");
  });

  it("rebases CRLF partial fragments to precise pointers and overlapping symbols", () => {
    const rawText = `${"a".repeat(200)}\r\n${"b".repeat(200)}`;
    const normalized = canonicalSourceDeliverySlice({
      filePath: "src/intervals.ts",
      sourceText: rawText,
      fullFileCharacterOffsets: { start: 0, end: rawText.length }
    });
    const alpha = {
      id: "symbol:alpha",
      name: "alpha",
      qualifiedName: "src/intervals.ts#alpha",
      kind: "constant",
      filePath: "src/intervals.ts",
      range: { start: { line: 5, column: 1 }, end: { line: 5, column: 201 } }
    };
    const beta = {
      id: "symbol:beta",
      name: "beta",
      qualifiedName: "src/intervals.ts#beta",
      kind: "constant",
      filePath: "src/intervals.ts",
      range: { start: { line: 6, column: 1 }, end: { line: 6, column: 201 } }
    };
    const first = response({
      status: status(),
      match: { status: "exact", symbol: alpha },
      source: {
        filePath: "src/intervals.ts",
        text: "a".repeat(200),
        range: alpha.range,
        truncated: false,
        sourceIdentity: sourceDeliveryIdentityFromText({
          filePath: "src/intervals.ts",
          text: "a".repeat(200),
          fullFileCharacterOffsets: { start: 0, end: 200 }
        })
      }
    });
    const second = response({
      status: status(),
      contentAvailability: "active-generation",
      selection: { filePath: "src/intervals.ts" },
      sourceIdentity: normalized.sourceIdentity,
      lines: normalized.text.split("\n").map((line, index) => ({ line: 5 + index, text: line })),
      symbols: [alpha, beta]
    });
    const session = new McpSourceSession();
    session.project(first, "node", "deduplicate");

    const projected = session.project(second, "file", "deduplicate");

    expect(projected.structuredContent).toMatchObject({
      sourceDelivery: {
        status: "partially-served",
        coveredPointers: [{
          range: { start: { line: 5, column: 1 }, end: { line: 5, column: 201 } },
          lineSpan: { start: 5, end: 5 },
          symbols: [{ name: "alpha" }],
          display: "src/intervals.ts:L5 (alpha)"
        }],
        fragments: [{
          text: `\n${"b".repeat(200)}`,
          pointer: {
            range: { start: { line: 5, column: 201 }, end: { line: 6, column: 201 } },
            lineSpan: { start: 5, end: 6 },
            symbols: [{ name: "beta" }],
            display: "src/intervals.ts:L5-L6 (beta)"
          }
        }]
      }
    });
  });

  it("bounds pointer symbols and discloses truncation", () => {
    const fixture = pointerFixture();
    const file = fixture.file.structuredContent;
    const base = (file.symbols as Array<Record<string, unknown>>)[0]!;
    file.symbols = Array.from({ length: 7 }, (_value, index) => ({
      ...base,
      id: `symbol:${index}`,
      name: `symbol${index}`,
      qualifiedName: `src/users.ts#symbol${index}`
    }));

    const projected = new McpSourceSession().project(fixture.file, "file", "deduplicate");

    expect(projected.structuredContent).toMatchObject({
      sourceDelivery: {
        status: "emitted",
        pointer: {
          symbols: [
            { name: "symbol0" },
            { name: "symbol1" },
            { name: "symbol2" },
            { name: "symbol3" },
            { name: "symbol4" }
          ],
          symbolsTruncated: true,
          display: "src/users.ts:L12-L14 (symbol0, symbol1, symbol2, symbol3, symbol4, +more)"
        }
      },
      sessionSource: { bounds: { maximumPointerSymbols: 5 } }
    });
  });

  it("deduplicates the same exact source across node, investigate, and file", () => {
    const session = new McpSourceSession();
    const node = session.project(nodeResponse(), "node", "deduplicate");
    const investigate = session.project(investigateResponse(), "investigate", "deduplicate");
    const file = session.project(fileResponse(), "file", "deduplicate");

    expect(node.structuredContent).toMatchObject({
      source: { text, delivery: { status: "emitted", callIndex: 1, tool: "node" } }
    });
    expect(investigate.structuredContent).toMatchObject({
      declarations: [{
        source: {
          text: null,
          renderedSegments: [{
            delivery: {
              status: "already-served",
              firstDeliveredCallIndex: 1,
              firstDeliveredTool: "node"
            }
          }]
        }
      }]
    });
    expect((investigate.structuredContent!.declarations as Array<Record<string, unknown>>)[0])
      .not.toHaveProperty("source.renderedSegments.0.text");
    expect(file.structuredContent).toMatchObject({
      lines: [],
      sourceDelivery: {
        status: "already-served",
        firstDeliveredCallIndex: 1,
        firstDeliveredTool: "node"
      },
      sessionSource: {
        equality: "verified-offset-map-and-canonical-content",
        summary: { candidateSources: 1, emittedSources: 0, referencedSources: 1 }
      }
    });
  });

  it("re-emits in full mode and resets safely when the generation changes", () => {
    const session = new McpSourceSession();
    session.project(nodeResponse(), "node", "deduplicate");
    const full = session.project(fileResponse(), "file", "full");
    const nextGeneration = session.project(investigateResponse("generation:2"), "investigate", "deduplicate");

    expect(full.structuredContent).toMatchObject({
      lines: [{ text }],
      sourceDelivery: { status: "emitted", callIndex: 2 }
    });
    expect(nextGeneration.structuredContent).toMatchObject({
      sessionSource: {
        callIndex: 1,
        generationReset: true,
        summary: { emittedSources: 1, referencedSources: 0 }
      }
    });
  });

  it("fails open for an unproven identity and re-emits after bounded eviction", () => {
    const malformed = nodeResponse();
    (malformed.structuredContent.source as Record<string, unknown>).sourceIdentity = {
      ...identity,
      contentSha256: "0".repeat(64)
    };
    const session = new McpSourceSession({ maximumSourcesPerProject: 1 });
    expect(session.project(malformed, "node", "deduplicate")).toBe(malformed);

    session.project(nodeResponse(), "node", "deduplicate");
    const otherText = "export const other = 2;";
    const otherIdentity = sourceDeliveryIdentityFromText({
      filePath: "src/users.ts",
      text: otherText,
      fullFileCharacterOffsets: { start: text.length + 1, end: text.length + 1 + otherText.length }
    });
    session.project(response({
      status: status(),
      source: { filePath: "src/users.ts", text: otherText, sourceIdentity: otherIdentity }
    }), "node", "deduplicate");
    const reemitted = session.project(nodeResponse(), "node", "deduplicate");
    expect(reemitted.structuredContent).toMatchObject({
      source: { text, delivery: { status: "emitted" } }
    });
  });

  it("emits only exact uncovered character intervals across tools", () => {
    const sourceText = `${"a".repeat(160)}${"b".repeat(320)}${"c".repeat(160)}`;
    const session = new McpSourceSession();

    session.project(nodeSliceResponse(sourceText, 160, 480), "node", "deduplicate");
    const partial = session.project(fileSliceResponse(sourceText, 0, sourceText.length), "file", "deduplicate");

    expect(partial.structuredContent).toMatchObject({
      lines: [],
      sourceDelivery: {
        status: "partially-served",
        coveredCharacterOffsets: [{ start: 160, end: 480 }],
        fragments: [
          {
            text: "a".repeat(160),
            sourceIdentity: { fullFileCharacterOffsets: { start: 0, end: 160 } }
          },
          {
            text: "c".repeat(160),
            sourceIdentity: { fullFileCharacterOffsets: { start: 480, end: 640 } }
          }
        ]
      },
      sessionSource: {
        equality: "verified-offset-map-and-canonical-content",
        summary: {
          candidateSources: 1,
          emittedSources: 0,
          partiallyReferencedSources: 1,
          referencedSources: 0,
          emittedCharacters: 320,
          avoidedCharacters: 320
        }
      }
    });

    const nowCovered = session.project(nodeSliceResponse(sourceText, 0, sourceText.length), "node", "deduplicate");
    expect(nowCovered.structuredContent).toMatchObject({
      source: { text: null, delivery: { status: "already-served" } },
      sessionSource: { summary: { referencedSources: 1, avoidedCharacters: 640 } }
    });
  });

  it("uses the same partial projection contract for node and investigate", () => {
    const sourceText = `${"a".repeat(160)}${"b".repeat(320)}${"c".repeat(160)}`;
    const investigateSession = new McpSourceSession();
    investigateSession.project(nodeSliceResponse(sourceText, 160, 480), "node", "deduplicate");
    const investigate = investigateSession.project(
      investigateSliceResponse(sourceText, 0, sourceText.length),
      "investigate",
      "deduplicate"
    );
    expect(investigate.structuredContent).toMatchObject({
      declarations: [{
        source: {
          text: null,
          renderedSegments: [{
            delivery: {
              status: "partially-served",
              fragments: [{ text: "a".repeat(160) }, { text: "c".repeat(160) }]
            }
          }]
        }
      }]
    });
    expect((investigate.structuredContent!.declarations as Array<Record<string, unknown>>)[0])
      .not.toHaveProperty("source.renderedSegments.0.text");

    const nodeSession = new McpSourceSession();
    nodeSession.project(fileSliceResponse(sourceText, 160, 480), "file", "deduplicate");
    const node = nodeSession.project(
      nodeSliceResponse(sourceText, 0, sourceText.length),
      "node",
      "deduplicate"
    );
    expect(node.structuredContent).toMatchObject({
      source: {
        text: null,
        delivery: {
          status: "partially-served",
          fragments: [{ text: "a".repeat(160) }, { text: "c".repeat(160) }]
        }
      }
    });
  });

  it("keeps the full source when proven overlap is below the savings floor", () => {
    const sourceText = `${"a".repeat(100)}${"b".repeat(400)}`;
    const session = new McpSourceSession();
    session.project(nodeSliceResponse(sourceText, 0, 100), "node", "deduplicate");

    const projected = session.project(fileSliceResponse(sourceText, 0, sourceText.length), "file", "deduplicate");
    expect(projected.structuredContent).toMatchObject({
      lines: [{ text: sourceText }],
      sourceDelivery: {
        status: "emitted",
        intervalDecision: { status: "full", reason: "below-minimum-savings" }
      },
      sessionSource: { summary: { avoidedCharacters: 0, emittedCharacters: 500 } }
    });
  });

  it("re-emits the full source when partial projection would abandon useful context", () => {
    const sourceText = `${"a".repeat(450)}${"b".repeat(50)}`;
    const session = new McpSourceSession();
    session.project(nodeSliceResponse(sourceText, 0, 450), "node", "deduplicate");

    const projected = session.project(fileSliceResponse(sourceText, 0, sourceText.length), "file", "deduplicate");
    expect(projected.structuredContent).toMatchObject({
      lines: [{ text: sourceText }],
      sourceDelivery: {
        status: "emitted",
        intervalDecision: { status: "full", reason: "insufficient-new-context" }
      }
    });
  });

  it("does not treat offset overlap as coverage when the overlapping content differs", () => {
    const original = `${"a".repeat(240)}${"b".repeat(240)}`;
    const changed = `${"x".repeat(240)}${"b".repeat(240)}`;
    const session = new McpSourceSession();
    session.project(nodeSliceResponse(original, 0, 240), "node", "deduplicate");

    const projected = session.project(fileSliceResponse(changed, 0, changed.length), "file", "deduplicate");
    expect(projected.structuredContent).toMatchObject({
      lines: [{ text: changed }],
      sourceDelivery: {
        status: "emitted",
        intervalDecision: { status: "full", reason: "no-proven-overlap" }
      }
    });
  });

  it("partially reuses normalized CRLF windows through a verified offset map", () => {
    const rawText = `${"a".repeat(200)}\r\n${"b".repeat(200)}`;
    const normalizedText = `${"a".repeat(200)}\n${"b".repeat(200)}`;
    const session = new McpSourceSession();
    session.project(nodeSliceResponse(rawText, 0, 200), "node", "deduplicate");
    const delivery = canonicalSourceDeliverySlice({
      filePath: "src/intervals.ts",
      sourceText: rawText,
      fullFileCharacterOffsets: { start: 0, end: rawText.length }
    });

    const projected = session.project(response({
      status: status(),
      contentAvailability: "active-generation",
      selection: { filePath: "src/intervals.ts" },
      sourceIdentity: delivery.sourceIdentity,
      lines: normalizedText.split("\n").map((line, index) => ({ line: index + 1, text: line }))
    }), "file", "deduplicate");

    expect(projected.structuredContent).toMatchObject({
      lines: [],
      sourceDelivery: {
        status: "partially-served",
        coveredCharacterOffsets: [{ start: 0, end: 200 }],
        fragments: [{
          text: `\n${"b".repeat(200)}`,
          sourceIdentity: {
            fullFileCharacterOffsets: { start: 200, end: rawText.length },
            offsetMap: {
              policy: "source-delivery-offset-map-v1",
              deliveredTextLength: 201,
              sourceTextLength: 202,
              spans: [
                {
                  kind: "normalized-line-ending",
                  deliveredCharacterOffsets: { start: 0, end: 1 },
                  fullFileCharacterOffsets: { start: 200, end: 202 }
                },
                {
                  kind: "identity",
                  deliveredCharacterOffsets: { start: 1, end: 201 },
                  fullFileCharacterOffsets: { start: 202, end: rawText.length }
                }
              ]
            }
          }
        }],
        intervalDecision: {
          status: "partial",
          reason: "proven-overlap",
          avoidedCharacters: 200,
          emittedCharacters: 201
        }
      }
    });
  });

  it("rejects a tampered offset-map receipt before changing the response", () => {
    const rawText = `${"a".repeat(200)}\r\n${"b".repeat(200)}`;
    const delivery = canonicalSourceDeliverySlice({
      filePath: "src/intervals.ts",
      sourceText: rawText,
      fullFileCharacterOffsets: { start: 0, end: rawText.length }
    });
    const malformed = response({
      status: status(),
      contentAvailability: "active-generation",
      selection: { filePath: "src/intervals.ts" },
      sourceIdentity: {
        ...delivery.sourceIdentity,
        offsetMap: { ...delivery.sourceIdentity.offsetMap, mapSha256: "0".repeat(64) }
      },
      lines: delivery.text.split("\n").map((line, index) => ({ line: index + 1, text: line }))
    });

    const projected = new McpSourceSession().project(malformed, "file", "deduplicate");

    expect(projected).toBe(malformed);
    expect(projected.structuredContent).not.toHaveProperty("sessionSource");

    const { mapSha256: _mapSha256, ...mapWithoutDigest } = delivery.sourceIdentity.offsetMap;
    const missingDigest = response({
      status: status(),
      contentAvailability: "active-generation",
      selection: { filePath: "src/intervals.ts" },
      sourceIdentity: {
        ...delivery.sourceIdentity,
        offsetMap: mapWithoutDigest
      },
      lines: delivery.text.split("\n").map((line, index) => ({ line: index + 1, text: line }))
    });
    const missingDigestProjection = new McpSourceSession().project(
      missingDigest,
      "file",
      "deduplicate"
    );
    expect(missingDigestProjection).toBe(missingDigest);
    expect(missingDigestProjection.structuredContent).not.toHaveProperty("sessionSource");
  });

  it("reuses normalized file coverage when a later node retains raw CRLF text", () => {
    const rawText = `${"a".repeat(200)}\r\n${"b".repeat(200)}`;
    const coveredDelivery = canonicalSourceDeliverySlice({
      filePath: "src/intervals.ts",
      sourceText: rawText,
      fullFileCharacterOffsets: { start: 0, end: 202 }
    });
    const session = new McpSourceSession();
    session.project(response({
      status: status(),
      contentAvailability: "active-generation",
      selection: { filePath: "src/intervals.ts" },
      sourceIdentity: coveredDelivery.sourceIdentity,
      lines: coveredDelivery.text.split("\n").map((line, index) => ({ line: index + 1, text: line }))
    }), "file", "deduplicate");

    const projected = session.project(nodeSliceResponse(rawText, 0, rawText.length), "node", "deduplicate");

    expect(projected.structuredContent).toMatchObject({
      source: {
        text: null,
        delivery: {
          status: "partially-served",
          coveredCharacterOffsets: [{ start: 0, end: 202 }],
          fragments: [{
            text: "b".repeat(200),
            sourceIdentity: { fullFileCharacterOffsets: { start: 202, end: 402 } }
          }],
          intervalDecision: {
            avoidedCharacters: 202,
            emittedCharacters: 200
          }
        }
      }
    });
  });

  it("re-emits when an overlap boundary splits one normalized CRLF sequence", () => {
    const rawText = `${"a".repeat(200)}\r\n${"b".repeat(200)}`;
    const delivery = canonicalSourceDeliverySlice({
      filePath: "src/intervals.ts",
      sourceText: rawText,
      fullFileCharacterOffsets: { start: 0, end: rawText.length }
    });
    const session = new McpSourceSession();
    session.project(nodeSliceResponse(rawText, 0, 201), "node", "deduplicate");

    const projected = session.project(response({
      status: status(),
      contentAvailability: "active-generation",
      selection: { filePath: "src/intervals.ts" },
      sourceIdentity: delivery.sourceIdentity,
      lines: delivery.text.split("\n").map((line, index) => ({ line: index + 1, text: line }))
    }), "file", "deduplicate");

    expect(projected.structuredContent).toMatchObject({
      lines: [{ text: "a".repeat(200) }, { text: "b".repeat(200) }],
      sourceDelivery: {
        status: "emitted",
        intervalDecision: { status: "full", reason: "offset-map-unavailable" }
      }
    });
  });

  it("re-emits instead of returning too many uncovered fragments", () => {
    const sourceText = "abcdefghij";
    const session = new McpSourceSession({
      minimumAvoidedCharacters: 1,
      minimumEmittedCharacters: 1,
      maximumFragmentsPerSource: 2
    });
    for (const [start, end] of [[1, 2], [3, 4], [5, 6]] as const) {
      session.project(nodeSliceResponse(sourceText, start, end), "node", "deduplicate");
    }

    const projected = session.project(fileSliceResponse(sourceText, 0, sourceText.length), "file", "deduplicate");
    expect(projected.structuredContent).toMatchObject({
      lines: [{ text: sourceText }],
      sourceDelivery: {
        status: "emitted",
        intervalDecision: { status: "full", reason: "too-many-fragments" }
      }
    });
  });
});
