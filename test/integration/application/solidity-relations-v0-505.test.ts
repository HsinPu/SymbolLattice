import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Solidity relations v0.505", () => {
  it("persists every exact same-contract private fixed-arity call", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "symbollattice-solidity-v0505-"));
    directories.push(projectPath);
    await writeFile(join(projectPath, "Token.sol"), `import {Base} from "./Base.sol";
contract Token is Base {
  function first(uint value) external { _record(value, address(this)); }
  function second() external { _record(1, address(0)); _record(2, address(0)); }
  function _record(uint value, address account) private {}
}`, "utf8");
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const edges = store.getSnapshot(projectPath).edges.filter((edge) => edge.kind === "calls");
    expect(edges).toHaveLength(3);
    expect(edges).toEqual(edges.map((edge) => expect.objectContaining({
      referenceName: "_record",
      resolution: "exact",
      confidence: 1,
      evidence: expect.objectContaining({
        ruleId: "syntax.solidity.same-contract.unique-private-fixed-arity-function-call",
        candidateSymbolIds: expect.any(Array)
      })
    })));
    expect(edges.every((edge) => edge.evidence.candidateSymbolIds.length === 1)).toBe(true);
  });
});
