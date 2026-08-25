import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type GoldenEdge = { source: string; target: string; kind: string };
type GoldenCase = {
  id: string;
  requiredFocuses: string[];
  forbiddenFocuses: string[];
  requiredFiles: string[];
  forbiddenFiles: string[];
  requiredEdges: GoldenEdge[];
  forbiddenEdges: GoldenEdge[];
  source: {
    requiredFilePaths: string[];
    minimumWindows: number;
    requireText: boolean;
    sourceTruncated: boolean;
    windowTruncated: boolean;
  };
  truncation: { connections: boolean; sourceWindows: boolean };
};

type GoldenCorpus = { schemaVersion: number; benchmark: string; cases: GoldenCase[] };
type GoldenResult = {
  focuses: Array<{ qualifiedName: string; filePath: string }>;
  connections: Array<{
    source: { qualifiedName: string };
    target: { qualifiedName: string };
    edge: { kind: string };
  }>;
  sourceWindows: Array<{ filePath: string; text: string; truncated: boolean }>;
  source: { filePath: string; text: string; truncated: boolean } | null;
  connectionsTruncated: boolean;
  sourceWindowsTruncated: boolean;
};

const corpus = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../benchmarks/mcp/semantic-golden.json", import.meta.url)), "utf8")
) as GoldenCorpus;

function filesIn(result: GoldenResult): Set<string> {
  const files = new Set(result.focuses.map((focus) => focus.filePath));
  for (const connection of result.connections) {
    files.add(connection.source.qualifiedName.split("#", 1)[0]);
    files.add(connection.target.qualifiedName.split("#", 1)[0]);
  }
  for (const window of result.sourceWindows) files.add(window.filePath);
  if (result.source !== null) files.add(result.source.filePath);
  return files;
}

function edgesIn(result: GoldenResult): Set<string> {
  return new Set(
    result.connections.map(
      (connection) => `${connection.source.qualifiedName}|${connection.target.qualifiedName}|${connection.edge.kind}`
    )
  );
}

function assertGolden(expected: GoldenCase, result: GoldenResult): void {
  const focuses = new Set(result.focuses.map((focus) => focus.qualifiedName));
  const files = filesIn(result);
  const edges = edgesIn(result);
  for (const focus of expected.requiredFocuses) expect(focuses).toContain(focus);
  for (const focus of expected.forbiddenFocuses) expect(focuses).not.toContain(focus);
  for (const file of expected.requiredFiles) expect(files).toContain(file);
  for (const file of expected.forbiddenFiles) expect(files).not.toContain(file);
  for (const edge of expected.requiredEdges) expect(edges).toContain(`${edge.source}|${edge.target}|${edge.kind}`);
  for (const edge of expected.forbiddenEdges) expect(edges).not.toContain(`${edge.source}|${edge.target}|${edge.kind}`);

  const sourcePaths = new Set(result.sourceWindows.map((window) => window.filePath));
  for (const filePath of expected.source.requiredFilePaths) expect(sourcePaths).toContain(filePath);
  expect(result.source).not.toBeNull();
  if (result.source !== null) {
    expect(expected.source.requiredFilePaths).toContain(result.source.filePath);
    if (expected.source.requireText) expect(result.source.text.length).toBeGreaterThan(0);
    expect(result.source.truncated).toBe(expected.source.sourceTruncated);
  }
  expect(result.sourceWindows.length).toBeGreaterThanOrEqual(expected.source.minimumWindows);
  if (expected.source.requireText) expect(result.sourceWindows.every((window) => window.text.length > 0)).toBe(true);
  expect(result.sourceWindows.some((window) => window.truncated)).toBe(expected.source.windowTruncated);
  expect(result.connectionsTruncated).toBe(expected.truncation.connections);
  expect(result.sourceWindowsTruncated).toBe(expected.truncation.sourceWindows);
}

const results: Record<string, GoldenResult> = {
  "exact-flow": {
    focuses: [{ qualifiedName: "src/api.ts#handleRequest", filePath: "src/api.ts" }],
    connections: [{
      source: { qualifiedName: "src/api.ts#handleRequest" },
      target: { qualifiedName: "src/db.ts#findUser" },
      edge: { kind: "calls" }
    }],
    sourceWindows: [{ filePath: "src/api.ts", text: "export function handleRequest() {}", truncated: false }],
    source: { filePath: "src/api.ts", text: "export function handleRequest() {}", truncated: false },
    connectionsTruncated: false,
    sourceWindowsTruncated: false
  },
  "bounded-truncation": {
    focuses: [{ qualifiedName: "src/large.ts#largeHandler", filePath: "src/large.ts" }],
    connections: [{
      source: { qualifiedName: "src/large.ts#largeHandler" },
      target: { qualifiedName: "src/shared.ts#sharedHelper" },
      edge: { kind: "calls" }
    }],
    sourceWindows: [{ filePath: "src/large.ts", text: "export function largeHandler() {}", truncated: true }],
    source: { filePath: "src/large.ts", text: "export function largeHandler() {}", truncated: true },
    connectionsTruncated: true,
    sourceWindowsTruncated: true
  }
};

describe("semantic explore golden corpus", () => {
  it("contains stable bounded semantic cases", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.benchmark).toBe("mcp-explore-semantic-golden-v1");
    expect(corpus.cases.map((testCase) => testCase.id)).toEqual(["exact-flow", "bounded-truncation"]);
  });

  for (const expected of corpus.cases) {
    it(`accepts ${expected.id} without requiring byte-for-byte output`, () => {
      const result = results[expected.id];
      expect(result).toBeDefined();
      assertGolden(expected, result!);
    });
  }

  it("rejects a result that invents a forbidden edge", () => {
    const expected = corpus.cases[0]!;
    const invalid = {
      ...results[expected.id]!,
      connections: [
        ...results[expected.id]!.connections,
        {
          source: { qualifiedName: "src/api.ts#handleRequest" },
          target: { qualifiedName: "src/secrets.ts#readSecret" },
          edge: { kind: "calls" }
        }
      ]
    };
    expect(() => assertGolden(expected, invalid)).toThrow();
  });
});
