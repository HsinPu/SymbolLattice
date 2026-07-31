import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";

const temporaryProjectPaths: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-cargo-workspace-"));
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

describe("Cargo workspace crate module resolution", () => {
  it("resolves an imported Rust crate only with explicit workspace and direct path-dependency proof", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        "members = [",
        '  "apps/server",',
        '  "crates/api-routes",',
        "]"
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api-routes = { path = "../../crates/api-routes" }'
      ].join("\n"),
      "apps/server/src/main.rs": "use api_routes::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;",
      "crates/api-routes/src/routes.rs": "pub fn configure() {}"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api_routes")).toEqual({
      targetFilePath: "crates/api-routes/src/lib.rs",
      strategy: "cargo-workspace-crate",
      configurationPaths: [
        "Cargo.toml",
        "apps/server/Cargo.toml",
        "crates/api-routes/Cargo.toml"
      ]
    });
    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "missing_crate")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["Cargo.toml", "apps/server/Cargo.toml"]
    });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "cargo-workspace-root-manifest", path: "Cargo.toml", state: "present" }),
        expect.objectContaining({
          kind: "cargo-workspace-package-manifest",
          path: "apps/server/Cargo.toml",
          state: "present"
        }),
        expect.objectContaining({
          kind: "cargo-workspace-package-manifest",
          path: "crates/api-routes/Cargo.toml",
          state: "present"
        })
      ])
    );
  });

  it("does not resolve a workspace crate without a direct local path dependency", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api-routes = "1"'
      ].join("\n"),
      "apps/server/src/main.rs": "use api_routes::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api_routes")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["Cargo.toml", "apps/server/Cargo.toml"]
    });
  });

  it("treats a package declared in the workspace root as an importing member", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["crates/api-routes"]',
        "",
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api-routes = { path = "crates/api-routes" }'
      ].join("\n"),
      "src/main.rs": "use api_routes::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("src/main.rs", "api_routes")).toEqual({
      targetFilePath: "crates/api-routes/src/lib.rs",
      strategy: "cargo-workspace-crate",
      configurationPaths: ["Cargo.toml", "crates/api-routes/Cargo.toml"]
    });
  });

  it("supports a direct Cargo dependency alias only when its package name matches the target manifest", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api = { package = "api-routes", path = "../../crates/api-routes" }'
      ].join("\n"),
      "apps/server/src/main.rs": "use api::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api")).toEqual({
      targetFilePath: "crates/api-routes/src/lib.rs",
      strategy: "cargo-workspace-crate",
      configurationPaths: [
        "Cargo.toml",
        "apps/server/Cargo.toml",
        "crates/api-routes/Cargo.toml"
      ]
    });
    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api_routes")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["Cargo.toml", "apps/server/Cargo.toml"]
    });
  });

  it("resolves a shared workspace dependency only when a member explicitly inherits its local path proof", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]',
        "",
        "[workspace.dependencies]",
        'api = { package = "api-routes", path = "crates/api-routes" }'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api = { workspace = true, features = ["http"], optional = false }'
      ].join("\n"),
      "apps/server/src/main.rs": "use api::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api")).toEqual({
      targetFilePath: "crates/api-routes/src/lib.rs",
      strategy: "cargo-workspace-crate",
      configurationPaths: [
        "Cargo.toml",
        "apps/server/Cargo.toml",
        "crates/api-routes/Cargo.toml"
      ]
    });
    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api_routes")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["Cargo.toml", "apps/server/Cargo.toml"]
    });
  });

  it("does not resolve a shared workspace dependency without root local path proof", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]',
        "",
        "[workspace.dependencies]",
        'api = { package = "api-routes", version = "1" }'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api = { workspace = true }'
      ].join("\n"),
      "apps/server/src/main.rs": "use api::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["Cargo.toml", "apps/server/Cargo.toml"]
    });
  });

  it("does not resolve a shared workspace dependency when the inherited declaration has an unsupported Cargo key", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]',
        "",
        "[workspace.dependencies]",
        'api = { package = "api-routes", path = "crates/api-routes" }'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api = { workspace = true, default-features = false }'
      ].join("\n"),
      "apps/server/src/main.rs": "use api::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["Cargo.toml", "apps/server/Cargo.toml"]
    });
  });

  it("does not resolve a shared workspace dependency when its root declaration is optional", async () => {
    const projectPath = await createProject({
      "Cargo.toml": [
        "[workspace]",
        'members = ["apps/server", "crates/api-routes"]',
        "",
        "[workspace.dependencies]",
        'api = { package = "api-routes", path = "crates/api-routes", optional = true }'
      ].join("\n"),
      "apps/server/Cargo.toml": [
        "[package]",
        'name = "server"',
        "",
        "[dependencies]",
        'api = { workspace = true }'
      ].join("\n"),
      "apps/server/src/main.rs": "use api::routes::configure;",
      "crates/api-routes/Cargo.toml": [
        "[package]",
        'name = "api-routes"'
      ].join("\n"),
      "crates/api-routes/src/lib.rs": "pub mod routes;"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.moduleResolver.resolve("apps/server/src/main.rs", "api")).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["Cargo.toml", "apps/server/Cargo.toml"]
    });
  });
});
