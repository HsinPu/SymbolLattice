import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_SYMBOL_LATTICE_PLUGIN_MODULES,
  SymbolLatticeError,
  loadSymbolLatticePluginModules
} from "../../../src/application/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeModule(directory: string, name: string, source: string): Promise<string> {
  const modulePath = join(directory, name);
  await writeFile(modulePath, source, "utf8");
  return modulePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("loadSymbolLatticePluginModules", () => {
  it("loads and fingerprints all three plugin kinds from one explicit in-project module", async () => {
    const projectPath = await temporaryDirectory("symbol-lattice-plugin-project-");
    await writeModule(
      projectPath,
      "plugins.mjs",
      `export const symbolLatticePlugin = {
        schemaVersion: 1,
        frameworkFactPlugins: [{
          id: "sample/file-facts", version: "1.0.0", languages: ["typescript"],
          extract: () => null
        }],
        frameworkProjectPlugins: [{
          id: "sample/project-facts", version: "1.0.0", languages: ["typescript"],
          finalize: () => null
        }],
        referenceResolverPlugins: [{
          id: "sample/resolver", version: "1.0.0", languages: ["typescript"],
          relations: ["calls"], resolve: () => null
        }]
      };\n`
    );

    const result = await loadSymbolLatticePluginModules({
      projectPath,
      modulePaths: ["plugins.mjs"]
    });

    expect(result.modulePaths).toEqual([join(projectPath, "plugins.mjs")]);
    expect(result.extensions.frameworkFactPlugins?.plugins.map(({ id }) => id)).toEqual([
      "sample/file-facts"
    ]);
    expect(result.extensions.frameworkProjectPlugins?.plugins.map(({ id }) => id)).toEqual([
      "sample/project-facts"
    ]);
    expect(result.extensions.referenceResolverPlugins?.plugins.map(({ id }) => id)).toEqual([
      "sample/resolver"
    ]);
    expect(result.extensions.frameworkFactPlugins?.fingerprint).toMatch(/^[a-f0-9]{16}$/u);
  });

  it("accepts a CommonJS default manifest", async () => {
    const projectPath = await temporaryDirectory("symbol-lattice-plugin-cjs-");
    await writeModule(
      projectPath,
      "plugin.cjs",
      `module.exports = {
        schemaVersion: 1,
        frameworkProjectPlugins: [{
          id: "sample/cjs", version: "1", languages: ["javascript"], finalize: () => null
        }]
      };\n`
    );

    const result = await loadSymbolLatticePluginModules({
      projectPath,
      modulePaths: ["plugin.cjs"]
    });

    expect(result.extensions.frameworkProjectPlugins?.plugins[0]?.id).toBe("sample/cjs");
  });

  it("rejects an external module unless the caller explicitly trusts it", async () => {
    const projectPath = await temporaryDirectory("symbol-lattice-plugin-root-");
    const externalPath = await temporaryDirectory("symbol-lattice-plugin-external-");
    const modulePath = await writeModule(
      externalPath,
      "plugin.mjs",
      `export default {
        schemaVersion: 1,
        frameworkFactPlugins: [{
          id: "sample/external", version: "1", languages: ["typescript"], extract: () => null
        }]
      };\n`
    );

    await expect(
      loadSymbolLatticePluginModules({ projectPath, modulePaths: [modulePath] })
    ).rejects.toMatchObject<Partial<SymbolLatticeError>>({ code: "INVALID_PLUGIN_MODULE" });

    const result = await loadSymbolLatticePluginModules({
      projectPath,
      modulePaths: [modulePath],
      allowExternalModules: true
    });
    expect(result.extensions.frameworkFactPlugins?.plugins[0]?.id).toBe("sample/external");
  });

  it.each([
    ["wrong schema", `export default { schemaVersion: 2, frameworkFactPlugins: [] };\n`],
    ["unknown manifest field", `export default { schemaVersion: 1, plugins: [] };\n`],
    ["empty manifest", `export default { schemaVersion: 1 };\n`],
    ["non-array field", `export default { schemaVersion: 1, frameworkFactPlugins: {} };\n`]
  ])("rejects %s", async (_label, source) => {
    const projectPath = await temporaryDirectory("symbol-lattice-plugin-invalid-");
    await writeModule(projectPath, "plugin.mjs", source);

    await expect(
      loadSymbolLatticePluginModules({ projectPath, modulePaths: ["plugin.mjs"] })
    ).rejects.toMatchObject<Partial<SymbolLatticeError>>({ code: "INVALID_PLUGIN_MODULE" });
  });

  it("rejects duplicate real paths and unsupported module extensions", async () => {
    const projectPath = await temporaryDirectory("symbol-lattice-plugin-paths-");
    const source = `export default {
      schemaVersion: 1,
      frameworkFactPlugins: [{
        id: "sample/paths", version: "1", languages: ["typescript"], extract: () => null
      }]
    };\n`;
    await writeModule(projectPath, "plugin.mjs", source);
    await writeModule(projectPath, "plugin.ts", source);

    await expect(
      loadSymbolLatticePluginModules({
        projectPath,
        modulePaths: ["plugin.mjs", join(projectPath, "plugin.mjs")]
      })
    ).rejects.toThrow("provided more than once");
    await expect(
      loadSymbolLatticePluginModules({ projectPath, modulePaths: ["plugin.ts"] })
    ).rejects.toThrow("raw TypeScript is not executed");
  });

  it("enforces the bounded module count before importing anything", async () => {
    const projectPath = await temporaryDirectory("symbol-lattice-plugin-count-");
    await expect(
      loadSymbolLatticePluginModules({
        projectPath,
        modulePaths: Array.from(
          { length: MAX_SYMBOL_LATTICE_PLUGIN_MODULES + 1 },
          (_, index) => `missing-${index}.mjs`
        )
      })
    ).rejects.toThrow(`At most ${MAX_SYMBOL_LATTICE_PLUGIN_MODULES}`);
  });

  it("wraps registry validation failures in the stable CLI error contract", async () => {
    const projectPath = await temporaryDirectory("symbol-lattice-plugin-registry-");
    await writeModule(
      projectPath,
      "plugin.mjs",
      `export default {
        schemaVersion: 1,
        referenceResolverPlugins: [{
          id: "Not Valid", version: "1", languages: ["typescript"],
          relations: ["calls"], resolve: () => null
        }]
      };\n`
    );

    await expect(
      loadSymbolLatticePluginModules({ projectPath, modulePaths: ["plugin.mjs"] })
    ).rejects.toMatchObject<Partial<SymbolLatticeError>>({
      code: "INVALID_PLUGIN_MODULE",
      message: expect.stringContaining("Plugin registry validation failed")
    });
  });
});
