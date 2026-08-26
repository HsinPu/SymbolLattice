import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";

import { StrictFreshReadCoordinator, SymbolLatticeService } from "../../dist/application/index.js";
import { FileSystemSourceCatalog } from "../../dist/infrastructure/filesystem/index.js";
import { SqliteAutoSyncOwnerLease, SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}
const fixturePath = argument("--fixture");
const outputPath = argument("--output");
if (fixturePath === null || outputPath === null) {
  throw new Error("Usage: --fixture <disposable-source-fixture> --output <json>");
}

const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-strict-fresh-benchmark-"));
try {
  await cp(resolve(fixturePath), projectPath, { recursive: true });
  const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
  await service.init({ projectPath });
  const coordinator = new StrictFreshReadCoordinator({
    service,
    writerEnabled: true,
    acquireWriterLease: (path) => new SqliteAutoSyncOwnerLease(path).acquire()
  });
  const measure = async (run) => {
    const startedAt = performance.now();
    const result = await run();
    return { durationMs: Number((performance.now() - startedAt).toFixed(3)), result };
  };

  const fresh = await measure(() => coordinator.execute(projectPath, async () => service.search(projectPath, "add")));
  await writeFile(join(projectPath, "src", "math.ts"), "export const strictFreshBenchmarkValue = 446;\n", "utf8");
  const staleCatchUp = await measure(() => coordinator.execute(projectPath, async () => service.search(projectPath, "strictFreshBenchmarkValue")));
  let queryAttempts = 0;
  const queryMutation = await measure(() => coordinator.execute(projectPath, async () => {
    queryAttempts += 1;
    const result = await service.search(projectPath, "strictFreshBenchmarkValue");
    if (queryAttempts === 1) {
      await writeFile(join(projectPath, "src", "math.ts"), "// changed during query\nexport const strictFreshBenchmarkValue = 446;\n", "utf8");
    }
    return result;
  }));
  const report = {
    schemaVersion: 1,
    benchmark: "strict-fresh-read-lifecycle-v1",
    productVersion: SYMBOL_LATTICE_VERSION,
    fresh: { durationMs: fresh.durationMs, stale: fresh.result.status.stale },
    staleCatchUp: {
      durationMs: staleCatchUp.durationMs,
      stale: staleCatchUp.result.status.stale,
      matchedLatestSource: staleCatchUp.result.results.some((item) => item.filePath === "src/math.ts")
    },
    queryMutation: {
      durationMs: queryMutation.durationMs,
      attempts: queryAttempts,
      stale: queryMutation.result.status.stale
    },
    diagnostics: coordinator.diagnostics(),
    allAssertionsPassed:
      !fresh.result.status.stale &&
      !staleCatchUp.result.status.stale &&
      !queryMutation.result.status.stale &&
      queryAttempts === 2
  };
  if (!report.allAssertionsPassed) throw new Error(`Strict freshness benchmark failed: ${JSON.stringify(report)}`);
  writeFileSync(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
} finally {
  await rm(projectPath, { recursive: true, force: true });
}
