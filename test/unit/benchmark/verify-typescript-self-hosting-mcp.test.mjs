import { describe, expect, it } from "vitest";

import {
  parseArguments,
  selectCreateSymbolIdCallTruth,
  statusIdentity
} from "../../../scripts/verify-typescript-self-hosting-mcp.mjs";

describe("verify-typescript-self-hosting-mcp helpers", () => {
  it("requires each explicit acceptance input", () => {
    expect(() => parseArguments(["--project", "C:/indexed", "--stage3", "stage3.json"])).toThrow("Usage:");
    expect(parseArguments(["--project", "C:/indexed", "--stage3", "stage3.json", "--output", "result.json"])).toEqual({
      projectPath: "C:/indexed",
      stage3Path: "stage3.json",
      outputPath: "result.json"
    });
  });

  it("selects only the exact Stage 3 call truth", () => {
    const truth = selectCreateSymbolIdCallTruth({
      positiveTruths: {
        callsAndInstantiates: [
          { kind: "calls", source: { qualifiedName: "src/domain/ids.ts#createSymbolId" }, target: { qualifiedName: "src/domain/ids.ts#encodePart" } }
        ]
      }
    });
    expect(truth.kind).toBe("calls");
    expect(() => selectCreateSymbolIdCallTruth({ positiveTruths: { callsAndInstantiates: [] } })).toThrow("createSymbolId");
  });

  it("retains only immutable graph status identity fields", () => {
    expect(statusIdentity({ generationId: "generation:1", indexedAt: "2026-08-14T00:00:00.000Z", counts: { files: 1, symbols: 2, edges: 3, pendingReferences: 0 }, stale: false })).toEqual({
      generationId: "generation:1",
      indexedAt: "2026-08-14T00:00:00.000Z",
      counts: { files: 1, symbols: 2, edges: 3, pendingReferences: 0 }
    });
  });
});
