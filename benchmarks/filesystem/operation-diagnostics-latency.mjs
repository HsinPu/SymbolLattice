import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { SymbolLatticeService } from "../../dist/application/index.js";
import { FileSystemSourceCatalog } from "../../dist/infrastructure/filesystem/index.js";
import { SqliteGraphStore, SqliteOperationDiagnosticJournal } from "../../dist/infrastructure/sqlite/index.js";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test", "fixtures", "basic-project");
const warmup = 3;
const samples = 30;

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(Math.ceil((percentileValue / 100) * sorted.length) - 1, sorted.length - 1)] ?? 0;
}

async function measureLifecycle(journalEnabled) {
  const init = [];
  const noOpSync = [];
  for (let iteration = 0; iteration < warmup + samples; iteration += 1) {
    const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-operation-benchmark-"));
    let operationJournal = null;
    try {
      await cp(fixture, projectPath, { recursive: true });
      const service = new SymbolLatticeService(
        new SqliteGraphStore(),
        new FileSystemSourceCatalog(),
        journalEnabled
          ? { operationDiagnosticJournalFactory: (path) => {
              operationJournal = new SqliteOperationDiagnosticJournal(path, { keepOpen: true });
              return operationJournal;
            } }
          : {}
      );
      let startedAt = performance.now();
      await service.init({ projectPath });
      const initDuration = performance.now() - startedAt;
      startedAt = performance.now();
      await service.sync({ projectPath });
      const syncDuration = performance.now() - startedAt;
      if (iteration >= warmup) {
        init.push(initDuration);
        noOpSync.push(syncDuration);
      }
    } finally {
      operationJournal?.close();
      await rm(projectPath, { recursive: true, force: true });
    }
  }
  return { init, noOpSync };
}

async function measureStageUpdate() {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-operation-stage-benchmark-"));
  try {
    await mkdir(join(projectPath, ".SymbolLattice"), { recursive: true });
    const journal = new SqliteOperationDiagnosticJournal(projectPath);
    const operationId = randomUUID();
    journal.start({ operationId, version: "benchmark", operation: "sync", startedAt: new Date().toISOString(), generationBefore: null });
    const values = [];
    for (let iteration = 0; iteration < warmup + samples; iteration += 1) {
      const startedAt = performance.now();
      journal.advance(operationId, iteration % 2 === 0 ? "scan" : "extraction", new Date().toISOString());
      const duration = performance.now() - startedAt;
      if (iteration >= warmup) values.push(duration);
    }
    journal.complete(operationId, { finishedAt: new Date().toISOString(), generationAfter: null });
    return values;
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

const disabled = await measureLifecycle(false);
const enabled = await measureLifecycle(true);
const stageUpdates = await measureStageUpdate();
const regression = (enabledValue, disabledValue) =>
  disabledValue === 0 ? 0 : ((enabledValue - disabledValue) / disabledValue) * 100;
const receipt = {
  schemaVersion: 1,
  benchmark: "operation-diagnostics-latency-v1",
  samples,
  warmup,
  milliseconds: {
    journalStageUpdateP95: percentile(stageUpdates, 95),
    init: {
      withoutJournalP95: percentile(disabled.init, 95),
      withJournalP95: percentile(enabled.init, 95),
      regressionPercent: regression(percentile(enabled.init, 95), percentile(disabled.init, 95))
    },
    noOpSync: {
      withoutJournalP95: percentile(disabled.noOpSync, 95),
      withJournalP95: percentile(enabled.noOpSync, 95),
      regressionPercent: regression(percentile(enabled.noOpSync, 95), percentile(disabled.noOpSync, 95))
    }
  }
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
