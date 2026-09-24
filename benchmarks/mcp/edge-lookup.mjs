import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

import { SymbolLatticeService } from "../../dist/application/service.js";
import { FileSystemSourceCatalog } from "../../dist/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";

const sourceJoin = "INNER JOIN symbols AS source ON source.id = e.source_id";
const targetJoin = "INNER JOIN symbols AS target ON target.id = e.target_id";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function git(project, ...args) {
  const result = spawnSync("git", args, { cwd: project, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fixed(value) {
  return Number(value.toFixed(3));
}

const project = option("--project");
const query = option("--query");
const output = option("--output");
const repetitions = Number(option("--repetitions") ?? 6);
if (!project || !query || !output || !Number.isSafeInteger(repetitions) || repetitions < 2) {
  throw new Error("Usage: --project <indexed-checkout> --query <text> --output <external-report.json> [--repetitions <n>=6]");
}

const projectPath = resolve(project);
const captured = [];
const originalPrepare = DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare = function (sql) {
  const statement = originalPrepare.call(this, sql);
  if (!sql.includes("FROM edges AS e") || !sql.includes("e.source_id IN")) return statement;
  return new Proxy(statement, {
    get(target, property) {
      if (property === "all") return (...args) => {
        captured.push({ sql, args });
        return target.all(...args);
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
};
try {
  const service = new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
  await service.explore(projectPath, query);
} finally {
  DatabaseSync.prototype.prepare = originalPrepare;
}
assert.ok(captured.length > 0, "Query did not use bounded graph edge lookup");

const database = new DatabaseSync(join(projectPath, ".SymbolLattice", "index.sqlite"), { readOnly: true });
const batches = [];
try {
  for (const { sql, args } of captured) {
    assert.ok(sql.includes(targetJoin), "Outgoing edge query must check its target");
    const oneJoinOutgoing = sql.replace(sourceJoin, "");
    const twoJoinOutgoing = oneJoinOutgoing.replace(targetJoin, `${sourceJoin}\n      ${targetJoin}`);
    const oneJoinIncoming = oneJoinOutgoing.replace(targetJoin, sourceJoin)
      .replace("e.source_id IN", "e.target_id IN");
    const twoJoinIncoming = twoJoinOutgoing.replace("e.source_id IN", "e.target_id IN");
    const statements = {
      one: [database.prepare(oneJoinOutgoing), database.prepare(oneJoinIncoming)],
      two: [database.prepare(twoJoinOutgoing), database.prepare(twoJoinIncoming)]
    };
    const elapsed = { one: [], two: [] };
    for (let iteration = 0; iteration < repetitions; iteration += 1) {
      const order = iteration % 2 === 0 ? ["two", "one"] : ["one", "two"];
      let expected;
      for (const variant of order) {
        const startedAt = performance.now();
        const rows = statements[variant].flatMap(statement => statement.all(...args));
        elapsed[variant].push(performance.now() - startedAt);
        const projected = rows.map(row => JSON.stringify(row)).sort();
        if (expected === undefined) expected = projected;
        else assert.deepEqual(projected, expected, "Edge lookup changed projected rows");
      }
    }
    batches.push({ frontierIds: args.length, twoJoinMeanMs: fixed(mean(elapsed.two)),
      oneJoinMeanMs: fixed(mean(elapsed.one)), rowsIdentical: true });
  }
} finally {
  database.close();
}

const cli = spawnSync(process.execPath, [resolve("dist/cli/main.js"), "--version"], { encoding: "utf8" });
assert.equal(cli.status, 0);
const report = {
  schemaVersion: 1,
  benchmark: "bounded-edge-lookup-v1",
  repository: git(projectPath, "remote", "get-url", "origin"),
  commit: git(projectPath, "rev-parse", "HEAD"),
  productVersion: cli.stdout.trim(),
  conditions: { projectPath, query, repetitions, node: process.version, platform: process.platform,
    timing: "Prepared SQL on one read-only SQLite connection; variants alternate per captured frontier batch. Excludes source retrieval, graph planning, rendering, and MCP transport." },
  batches,
  totals: { batchCount: batches.length,
    twoJoinSumMeanMs: fixed(batches.reduce((sum, batch) => sum + batch.twoJoinMeanMs, 0)),
    oneJoinSumMeanMs: fixed(batches.reduce((sum, batch) => sum + batch.oneJoinMeanMs, 0)),
    allRowsIdentical: batches.every(batch => batch.rowsIdentical) }
};
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.totals));
