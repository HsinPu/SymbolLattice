#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const INDEX_EVIDENCE_VERSION = "typescript-large-project-index-evidence-v1";

export function parseIndexEvidenceArguments(argv) {
  const result = { project: null, output: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--project") result.project = resolve(value);
    else if (flag === "--output") result.output = resolve(value);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (result.project === null || result.output === null) {
    throw new Error("Required arguments: --project <indexed-project> --output <evidence.json>");
  }
  return result;
}

function endpoint(symbol) {
  return {
    id: symbol.id,
    filePath: symbol.filePath,
    name: symbol.name,
    kind: symbol.kind,
    range: symbol.range
  };
}

export function projectIndexEvidence(bundle) {
  const symbolsById = new Map(bundle.snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  const symbols = bundle.snapshot.symbols.map(endpoint);
  const edges = bundle.snapshot.edges.flatMap((edge) => {
    if (edge.resolution !== "exact" || edge.targetId === null) return [];
    const source = symbolsById.get(edge.sourceId);
    const target = symbolsById.get(edge.targetId);
    if (source === undefined || target === undefined) return [];
    return [{
      id: edge.id,
      kind: edge.kind,
      source: endpoint(source),
      target: endpoint(target),
      occurrence: {
        filePath: edge.filePath,
        name: edge.referenceName,
        kind: "occurrence",
        range: { start: edge.range.start }
      },
      resolution: edge.resolution,
      confidence: edge.confidence,
      evidence: {
        rule: edge.evidence?.ruleId ?? null,
        stage: edge.evidence?.stage ?? null,
        candidateSymbolIds: edge.evidence?.candidateSymbolIds ?? []
      }
    }];
  });
  return {
    schemaVersion: 1,
    evidenceVersion: INDEX_EVIDENCE_VERSION,
    projectPath: bundle.status.projectPath,
    generationId: bundle.status.generationId,
    indexedAt: bundle.status.indexedAt,
    counts: bundle.status.counts,
    symbols,
    edges
  };
}

async function main() {
  const options = parseIndexEvidenceArguments(process.argv.slice(2));
  const { SqliteGraphStore } = await import("../dist/infrastructure/sqlite/index.js");
  const bundle = new SqliteGraphStore().getActiveGenerationBundle(options.project);
  const evidence = projectIndexEvidence(bundle);
  await writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output: options.output, generationId: evidence.generationId, counts: evidence.counts, symbols: evidence.symbols.length, exactEdges: evidence.edges.length }, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
