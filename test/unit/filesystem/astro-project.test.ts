import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";

const temporaryProjectPaths: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-astro-project-"));
  temporaryProjectPaths.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjectPaths.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true }))
  );
});

describe("Astro project evidence", () => {
  it("tracks root config candidates and enables one exact Astro configuration", async () => {
    const projectPath = await createProject({
      "astro.config.mjs": "export default {};\n",
      "src/pages/api.ts": "export function GET() { return new Response(); }\n"
    });

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.frameworkEvidence).toEqual({ astro: true });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "astro-config", path: "astro.config.mjs", state: "present" }),
        expect.objectContaining({ kind: "astro-config", path: "astro.config.ts", state: "absent" })
      ])
    );
    expect(scan.sourceDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relativePath: "astro.config.mjs", language: "javascript" }),
        expect.objectContaining({ relativePath: "src/pages/api.ts", language: "typescript" })
      ])
    );
  });

  it("fails closed when Astro configuration is absent or ambiguous", async () => {
    const noConfigProject = await createProject({
      "src/pages/api.ts": "export function GET() { return new Response(); }\n"
    });
    const ambiguousProject = await createProject({
      "astro.config.mjs": "export default {};\n",
      "astro.config.ts": "export default {};\n",
      "src/pages/api.ts": "export function GET() { return new Response(); }\n"
    });

    await expect(new FileSystemSourceCatalog().scan(noConfigProject)).resolves.toMatchObject({
      frameworkEvidence: { astro: false }
    });
    await expect(new FileSystemSourceCatalog().scan(ambiguousProject)).resolves.toMatchObject({
      frameworkEvidence: { astro: false }
    });
  });
});
