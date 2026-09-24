import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const projects: string[] = [];
afterEach(async () => {
  await Promise.all(projects.splice(0).map((project) => rm(project, { recursive: true, force: true })));
});

it("keeps executable calls ahead of source-only property references in bounded context", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-commonjs-context-"));
  projects.push(projectPath);
  const names = Array.from({ length: 10 }, (_, index) => `Error${index}`);
  await writeFile(join(projectPath, "provider.js"), [
    "'use strict'",
    `const codes = { ${names.map((name) => `${name}: class ${name} {}`).join(", ")} }`,
    "module.exports = codes"
  ].join("\n"));
  await writeFile(join(projectPath, "consumer.js"), [
    "'use strict'",
    `const { ${names.join(", ")} } = require('./provider')`,
    "function complete() {}",
    `function run() { ${names.map((name) => `new ${name}()`).join("; ")}; complete() }`
  ].join("\n"));
  const store = new SqliteGraphStore();
  try {
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const result = await service.context(projectPath, ["consumer.js#run"]);
    const callees = result.contexts[0]!.callees;
    expect(callees.items.some((item) => item.edge.kind === "calls" && item.symbol.name === "complete")).toBe(true);
    expect(callees.truncated).toBe(true);
    expect(callees.items.some((item) => item.edge.evidence?.ruleId === "module.commonjs-object-property-reference")).toBe(true);
    expect(callees.items.every((item, index, items) => index === 0 ||
      item.edge.evidence?.ruleId === "module.commonjs-object-property-reference" ||
      items[index - 1]?.edge.evidence?.ruleId !== "module.commonjs-object-property-reference")).toBe(true);
    const unresolved = store.getActiveGraphBundle(projectPath).snapshot.edges.filter((edge) =>
      edge.filePath === "consumer.js" && edge.kind === "instantiates" && edge.resolution === "unresolved");
    expect(unresolved).toHaveLength(names.length);
  } finally {
    store.close();
  }
});
