import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-rust-v458-"));
  temporaryDirectories.push(projectPath);
  await Promise.all(Object.entries(files).map(async ([relativePath, sourceText]) => {
    const absolutePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, sourceText, "utf8");
  }));
  return projectPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Rust v0.458 project relations", () => {
  it("projects direct crate imports, inherent methods, constructions, and one impl trait edge", async () => {
    const projectPath = await createProject({
      "Cargo.toml": "[package]\nname = \"rust-v458\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
      "src/lib.rs": [
        "pub mod service;",
        "pub mod caller;",
        "pub trait Worker { fn run(&self); }",
        "pub enum Kind { Unit }"
      ].join("\n") + "\n",
      "src/service.rs": [
        "use crate::Worker;",
        "pub struct Service { pub value: i32 }",
        "impl Service {",
        "  pub fn new() -> Self { Service { value: 0 } }",
        "  pub fn run(&self) {}",
        "}",
        "impl Worker for Service { fn run(&self) {} }"
      ].join("\n") + "\n",
      "src/caller.rs": [
        "use crate::service::Service;",
        "pub fn caller() {",
        "  let service: Service = Service::new();",
        "  service.run();",
        "  let _copy = Service { value: 1 };",
        "  let _kind = crate::Kind::Unit;",
        "}",
        "pub fn trait_caller(worker: &dyn crate::Worker) { worker.run(); }"
      ].join("\n") + "\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const caller = symbol("src/caller.rs#caller");
    const serviceType = symbol("src/service.rs#Service");
    const newMethod = symbol("src/service.rs#Service::new");
    const runMethod = symbol("src/service.rs#Service::run");
    const worker = symbol("src/lib.rs#Worker");
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "imports",
        sourceId: symbol("src/caller.rs")?.id,
        targetId: symbol("src/service.rs")?.id,
        referenceName: "crate::service::Service",
        resolution: "exact"
      }),
      expect.objectContaining({
        kind: "calls",
        sourceId: caller?.id,
        targetId: newMethod?.id,
        referenceName: "new",
        resolution: "exact",
        evidence: expect.objectContaining({ ruleId: "project.rust.impl.unique-inherent-associated-function-call" })
      }),
      expect.objectContaining({
        kind: "calls",
        sourceId: caller?.id,
        targetId: runMethod?.id,
        referenceName: "run",
        resolution: "exact",
        evidence: expect.objectContaining({ ruleId: "project.rust.impl.unique-inherent-method-call" })
      }),
      expect.objectContaining({
        kind: "instantiates",
        sourceId: caller?.id,
        targetId: serviceType?.id,
        referenceName: "Service",
        resolution: "exact"
      }),
      expect.objectContaining({
        kind: "instantiates",
        sourceId: caller?.id,
        targetId: symbol("src/lib.rs#Kind")?.id,
        referenceName: "Kind",
        resolution: "exact"
      }),
      expect.objectContaining({
        kind: "implements",
        sourceId: serviceType?.id,
        targetId: worker?.id,
        resolution: "exact",
        evidence: expect.objectContaining({ ruleId: "project.rust.impl.unique-trait" })
      })
    ]));
    expect(snapshot.edges.some(
      (edge) => edge.kind === "calls" && edge.sourceId === symbol("src/caller.rs#trait_caller")?.id && edge.resolution === "exact"
    )).toBe(false);
  });

  it("does not project private cross-file types or methods as exact relations", async () => {
    const projectPath = await createProject({
      "Cargo.toml": "[package]\nname = \"rust-v458-private\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
      "src/lib.rs": "pub mod private;\npub mod caller;\n",
      "src/private.rs": [
        "struct Hidden;",
        "impl Hidden {",
        "  pub fn new() -> Self { Hidden }",
        "  pub fn run(&self) {}",
        "}"
      ].join("\n") + "\n",
      "src/caller.rs": [
        "use crate::private::Hidden;",
        "pub fn caller() {",
        "  let hidden: Hidden = Hidden::new();",
        "  hidden.run();",
        "  let _copy = Hidden;",
        "}"
      ].join("\n") + "\n"
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const caller = symbol("src/caller.rs#caller");
    const hidden = symbol("src/private.rs#Hidden");
    expect(snapshot.edges.some(
      (edge) => edge.sourceId === caller?.id && edge.targetId === hidden?.id && edge.resolution === "exact"
    )).toBe(false);
  });
});
