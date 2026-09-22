import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("loads default extraction for writes while fresh reads and unchanged sync avoid it", () => {
  const project = mkdtempSync(resolve(tmpdir(), "symbollattice-lazy-extraction-"));
  const moduleUrl = path => pathToFileURL(resolve(path)).href;
  try {
    writeFileSync(resolve(project, "entry.ts"), "export function greet() { return 'hello'; }\n");
    for (const phase of ["index", "read", "sync"]) {
      if (phase === "sync") {
        writeFileSync(resolve(project, "entry.ts"), "export function farewell() { return 'bye'; }\n");
      }
      const marker = resolve(project, `loaded-${phase}.txt`);
      const loader = `import {writeFileSync} from 'node:fs';
        export async function resolve(specifier, context, next) {
          const result = await next(specifier, context);
          if (result.url.endsWith('/extraction/index.js')) writeFileSync(${JSON.stringify(marker)}, 'loaded');
          return result;
        }`;
      const script = `
        import assert from 'node:assert/strict';
        import {existsSync} from 'node:fs';
        import {register} from 'node:module';
        register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, import.meta.url);
        const {SymbolLatticeService} = await import(${JSON.stringify(moduleUrl("dist/application/service.js"))});
        const {SqliteGraphStore} = await import(${JSON.stringify(moduleUrl("dist/infrastructure/sqlite/graph-store.js"))});
        const {FileSystemSourceCatalog} = await import(${JSON.stringify(moduleUrl("dist/infrastructure/filesystem/source-catalog.js"))});
        const store = new SqliteGraphStore();
        const service = new SymbolLatticeService(store, new FileSystemSourceCatalog());
        assert.equal(existsSync(${JSON.stringify(marker)}), false, 'construction must not load extraction');
        const project = ${JSON.stringify(project)}, phase = ${JSON.stringify(phase)};
        if (phase === 'index') await service.index({projectPath:project, force:true});
        else await service.sync({projectPath:project, force:true});
        const result = await service.explore(project, phase === 'sync' ? 'farewell' : 'greet');
        assert.equal(result.status.stale, false);
        assert.ok(store.getSnapshot(project).symbols.some(s => s.name === (phase === 'sync' ? 'farewell' : 'greet')));
        assert.equal(existsSync(${JSON.stringify(marker)}), phase !== 'read');
        store.close();
      `;
      expect(() => execFileSync(process.execPath, ["--input-type=module", "--eval", script],
        { encoding: "utf8", timeout: 30_000, stdio: "pipe" })).not.toThrow();
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}, 90_000);

it("loads extraction for immutable Git hunk attribution in a fresh process", () => {
  const serviceUrl = pathToFileURL(resolve("dist/application/service.js")).href;
  const script = `
    import assert from 'node:assert/strict';
    const {SymbolLatticeService} = await import(${JSON.stringify(serviceUrl)});
    const change = {kind:'modified',previousPath:'entry.ts',currentPath:'entry.ts',score:null};
    const side = (revision,name) => ({revision,filePath:'entry.ts',language:'typescript',
      availability:'available',sourceText:'export function '+name+'() { return 1; }'});
    const provider = {async getRevisionHunks() {return {
      changeSet:{requestedBaseRef:'main',mergeBaseCommit:'b'.repeat(40),headCommit:'a'.repeat(40),
        includesUntracked:false,changes:[change],sourcePaths:['entry.ts']},
      files:[{change,previous:side('b'.repeat(40),'before'),current:side('a'.repeat(40),'after'),
        hunks:[{oldRange:{start:1,count:1},newRange:{start:1,count:1}}]}]
    };}};
    const unavailable = new Proxy({}, {get(){throw new Error('must use immutable revision blobs');}});
    const service = new SymbolLatticeService(unavailable,unavailable,{},undefined,provider);
    const result = await service.gitHunks(process.cwd(),'main');
    assert.equal(result.hunks.items[0].old.declarationAnchors.items[0].name,'before');
    assert.equal(result.hunks.items[0].new.declarationAnchors.items[0].name,'after');
  `;
  expect(() => execFileSync(process.execPath, ["--input-type=module", "--eval", script],
    { encoding: "utf8", timeout: 30_000, stdio: "pipe" })).not.toThrow();
}, 30_000);
