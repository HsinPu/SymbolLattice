import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(resolve(tmpdir(), "SymbolLattice-kotlin-v459-"));
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

describe("Kotlin v0.459 project relations", () => {
  it("projects explicit imports, constructors, member/extension calls, heritage, and override", async () => {
    const projectPath = await createProject({
      "src/api/Contract.kt": `package demo.api

interface Contract { fun act() }
open class Widget(val value: Int) {
  open fun run() {}
}
fun helper() {}
fun Widget.ext() {}
`,
      "src/app/Service.kt": `package demo.app

import demo.api.Contract
import demo.api.Widget

class Service : Contract {
  override fun act() {}
  fun create(): Widget = Widget(1)
}
`,
      "src/app/Caller.kt": `package demo.app

import demo.api.Widget
import demo.api.ext
import demo.api.helper
import demo.app.Service

fun caller() {
  val service: Service = Service()
  val widget: Widget = Widget(1)
  widget.run()
  widget.ext()
  helper()
  service.act()
}
`
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());

    await service.init({ projectPath });

    const snapshot = store.getSnapshot(projectPath);
    const symbol = (qualifiedName: string) => snapshot.symbols.find((item) => item.qualifiedName === qualifiedName);
    const caller = symbol("src/app/Caller.kt#caller");
    const widget = symbol("src/api/Contract.kt#Widget");
    const widgetRun = symbol("src/api/Contract.kt#Widget.run");
    const widgetExt = symbol("src/api/Contract.kt#ext");
    const helper = symbol("src/api/Contract.kt#helper");
    const serviceType = symbol("src/app/Service.kt#Service");
    const contract = symbol("src/api/Contract.kt#Contract");
    const serviceAct = symbol("src/app/Service.kt#Service.act");

    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "imports",
        sourceId: symbol("src/app/Caller.kt")?.id,
        targetId: widget?.id,
        referenceName: "Widget",
        resolution: "exact",
        evidence: expect.objectContaining({ ruleId: "module.kotlin.explicit-import.unique-target" })
      }),
      expect.objectContaining({
        kind: "calls",
        sourceId: caller?.id,
        targetId: widgetRun?.id,
        referenceName: "run",
        resolution: "exact",
        evidence: expect.objectContaining({ ruleId: "syntax.kotlin.unique-member-call" })
      }),
      expect.objectContaining({
        kind: "calls",
        sourceId: caller?.id,
        targetId: widgetExt?.id,
        referenceName: "ext",
        resolution: "exact",
        evidence: expect.objectContaining({ ruleId: "syntax.kotlin.unique-extension-function-call" })
      }),
      expect.objectContaining({
        kind: "calls",
        sourceId: caller?.id,
        targetId: helper?.id,
        referenceName: "helper",
        resolution: "exact"
      }),
      expect.objectContaining({
        kind: "instantiates",
        sourceId: caller?.id,
        targetId: widget?.id,
        referenceName: "Widget",
        resolution: "exact"
      }),
      expect.objectContaining({
        kind: "implements",
        sourceId: serviceType?.id,
        targetId: contract?.id,
        resolution: "exact"
      }),
      expect.objectContaining({
        kind: "overrides",
        sourceId: serviceAct?.id,
        targetId: symbol("src/api/Contract.kt#Contract.act")?.id,
        referenceName: "act",
        resolution: "exact"
      })
    ]));
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "calls",
        sourceId: caller?.id,
        targetId: serviceAct?.id,
        referenceName: "act",
        resolution: "exact"
      })
    ]));
  });

  it("does not project private cross-file Kotlin declarations as exact targets", async () => {
    const projectPath = await createProject({
      "src/private/Hidden.kt": `package demo.private

private class Hidden {
  fun run() {}
}
`,
      "src/Caller.kt": `package demo.app

import demo.private.Hidden

fun caller() {
  val hidden: Hidden = Hidden()
  hidden.run()
}
`
    });
    const store = new SqliteGraphStore();
    const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
    await service.init({ projectPath });
    const snapshot = store.getSnapshot(projectPath);
    const caller = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/Caller.kt#caller");
    const hidden = snapshot.symbols.find((symbol) => symbol.qualifiedName === "src/private/Hidden.kt#Hidden");
    expect(snapshot.edges.some(
      (edge) => edge.sourceId === caller?.id && edge.targetId === hidden?.id && edge.resolution === "exact"
    )).toBe(false);
  });
});
