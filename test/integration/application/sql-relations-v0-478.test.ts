import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { SymbolLatticeService } from "../../../src/application/service.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/graph-store.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/source-catalog.js";

const temporaryDirectories: string[] = [];

async function createInlineProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-sql-project-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true })));
});

describe("PostgreSQL project relations v0.478", () => {
  it("resolves unique cross-file foreign-key and table inheritance targets", async () => {
    const projectPath = await createInlineProject({
      "db/base.sql": "CREATE TABLE public.parent (id integer);\nCREATE TABLE public.audit (id integer);\n",
      "db/child.sql": [
        "CREATE TABLE public.child (",
        "  parent_id integer REFERENCES public.parent(id),",
        "  audit_id integer,",
        "  CONSTRAINT child_audit_fk FOREIGN KEY (audit_id) REFERENCES public.audit(id)",
        ") INHERITS (public.parent);",
        ""
      ].join("\n")
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    const indexed = await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    const child = snapshot.symbols.find((symbol) => symbol.name === "public.child");
    const parent = snapshot.symbols.find((symbol) => symbol.name === "public.parent");
    const audit = snapshot.symbols.find((symbol) => symbol.name === "public.audit");
    expect(indexed).toMatchObject({ stale: false });
    expect(graphStore.getActiveGraphBundle(projectPath).extractorVersion).toContain("multi-language-ast-v418");
    expect(graphStore.getActiveGraphBundle(projectPath).resolverVersion).toContain("project-resolver-v199");
    expect(graphStore.getArtifactFacts(projectPath).find((facts) => facts.filePath === "db/child.sql")?.sqlFacts).toMatchObject({ parserRejected: false });
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: child?.id, targetId: parent?.id, kind: "references", resolution: "exact" }),
      expect.objectContaining({ sourceId: child?.id, targetId: audit?.id, kind: "references", resolution: "exact" }),
      expect.objectContaining({ sourceId: child?.id, targetId: parent?.id, kind: "extends", resolution: "exact" })
    ]));
  });

  it("keeps unqualified duplicate table targets unresolved", async () => {
    const projectPath = await createInlineProject({
      "db/a.sql": "CREATE TABLE parent (id integer);\n",
      "db/b.sql": "CREATE TABLE parent (id integer);\n",
      "db/child.sql": "CREATE TABLE child (parent_id integer REFERENCES parent(id));\n"
    });
    const graphStore = new SqliteGraphStore();
    const service = new SymbolLatticeService(graphStore, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = graphStore.getSnapshot(projectPath);
    expect(snapshot.edges.filter((edge) => edge.kind === "references" || edge.kind === "extends")).toEqual([]);
  });
});
