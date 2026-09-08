import { createLuaWorkerRuntime } from "../../dist/extraction/lua-worker-runtime.js";
import { projectLuaStructuralFacts } from "../../dist/extraction/lua-structural.js";

/** Mirror the Lua worker branch used by SymbolLatticeService.extractPersistedFacts. */
export async function prepareLuaFixtureFacts(fixtures) {
  const runtime = createLuaWorkerRuntime();
  const results = new Map();
  for (const fixture of fixtures.filter(({ language }) => language === "lua")) {
    const sourceBytes = Buffer.from(fixture.sourceText, "utf8");
    const response = await runtime.parse({ filePath: fixture.filePath, sourceBytes });
    if (response.decision.kind !== "emit") throw new Error(`Lua fixture rejected: ${JSON.stringify(response.decision)}`);
    results.set(fixture.filePath, projectLuaStructuralFacts({ ...fixture, sourceBytes, response }));
  }
  return results;
}
