import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const projects: string[] = [];

async function project(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "symbollattice-sfc-v0502-"));
  projects.push(root);
  for (const [path, sourceText] of Object.entries(files)) {
    const absolute = join(root, ...path.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, sourceText, "utf8");
  }
  return root;
}

afterEach(async () => {
  await Promise.all(projects.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("SFC component relations v0.502", () => {
  it("resolves direct imported Vue, Svelte, and Astro component tags", async () => {
    const root = await project({
      "vue/App.vue": [
        "<template><Card /></template>",
        "<script setup>",
        "import Card from './Card.vue';",
        "</script>"
      ].join("\n"),
      "vue/Card.vue": "<template><article /></template>\n<script setup></script>",
      "svelte/App.svelte": [
        "<script>import Card from './Card.svelte';</script>",
        "<Card />"
      ].join("\n"),
      "svelte/Card.svelte": "<article />",
      "astro/App.astro": [
        "---",
        "import Card from './Card.astro';",
        "---",
        "<Card />"
      ].join("\n"),
      "astro/Card.astro": "<article />"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath: root });
    const snapshot = store.getSnapshot(root);
    const references = snapshot.edges.filter((edge) =>
      edge.kind === "references" && edge.referenceName === "Card" && edge.resolution === "exact"
    );
    expect(references).toHaveLength(3);
    expect(references.every((edge) =>
      edge.confidence === 1 && edge.evidence?.candidateSymbolIds?.length === 1
    )).toBe(true);
  });

  it("fails closed for dynamic, type-only, rebound, module-scope, and non-direct tags", async () => {
    const root = await project({
      "vue/App.vue": [
        "<template><!-- <Card /> --><component :is=\"Card\" /><card /></template>",
        "<script setup lang=\"ts\">",
        "import type Card from './Card.vue';",
        "</script>"
      ].join("\n"),
      "vue/Card.vue": "<template><article /></template>\n<script setup></script>",
      "svelte/App.svelte": [
        "<script context=\"module\">import Card from './Card.svelte';</script>",
        "<svelte:component this={Card} />"
      ].join("\n"),
      "svelte/Card.svelte": "<article />",
      "astro/App.astro": [
        "---",
        "import Card from './Card.astro';",
        "Card = Other;",
        "---",
        "{'<Card />'}"
      ].join("\n"),
      "astro/Card.astro": "<article />"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath: root });
    expect(store.getSnapshot(root).edges.filter((edge) =>
      edge.kind === "references" && edge.referenceName === "Card" && edge.resolution === "exact"
    )).toEqual([]);
  });
});
