import { describe, expect, it } from "vitest";

import { sourceDeliveryIdentityFromText } from "../../src/application/source-delivery.js";
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

describe("MCP source session", () => {
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
        equality: "exact-file-offsets-and-canonical-content",
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
});
