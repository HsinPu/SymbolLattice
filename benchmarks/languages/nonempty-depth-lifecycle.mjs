import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGE_NONEMPTY_FIXTURES } from "./nonempty-depth-fixtures.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = await mkdtemp(join(tmpdir(), "symbollattice-nonempty-lifecycle-"));
const project = join(workspace, "project");
const cli = (...args) => JSON.parse(execFileSync(process.execPath, [join(root, "dist/cli/main.js"), ...args, "--project", project, "--json"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true }));
const stages = [];
function record(name, status, expectedFiles) {
  assert.equal(status.initialized, true, name);
  assert.equal(status.stale, false, name);
  assert.equal(status.counts.files, expectedFiles, name);
  const listing = cli("files", "--limit", "100");
  assert.equal(listing.matchedFileCount, expectedFiles, name);
  assert.equal(listing.truncated, false, name);
  stages.push({ name, generationId: status.generationId, counts: status.counts, passed: true });
  return status;
}
function checkSource(path, text, name) {
  const result = cli("file", path);
  assert.equal(result.contentAvailability, "active-generation");
  assert.equal(result.lines.map(line => line.text).join("\n"), text);
  assert.deepEqual(result.symbols.filter(s => s.kind === "function").map(s => s.name), [name]);
  return result.sourceIdentity.contentSha256;
}
try {
  await mkdir(project);
  await writeFile(join(project, "package.json"), '{"name":"nonempty-lifecycle","private":true}\n');
  for (const fixture of LANGUAGE_NONEMPTY_FIXTURES) {
    const target = resolve(project, fixture.filePath);
    const offset = relative(project, target);
    assert(!isAbsolute(offset) && !offset.startsWith(".."));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, fixture.sourceText);
  }
  const fresh = record("fresh-58-languages", cli("init"), 58);
  const original = LANGUAGE_NONEMPTY_FIXTURES.find(f => f.language === "typescript").sourceText;
  const originalHash = checkSource("sample.ts", original, "greet");
  const noop = record("no-op", cli("sync"), 58);
  assert.equal(noop.generationId, fresh.generationId);
  const commented = `// lifecycle comment\n${original}`;
  await writeFile(join(project, "sample.ts"), commented);
  const comment = record("comment-typescript", cli("sync"), 58);
  assert.notEqual(comment.generationId, noop.generationId);
  assert.notEqual(checkSource("sample.ts", commented, "greet"), originalHash);
  const semantic = original.replaceAll("greet", "salute");
  await writeFile(join(project, "sample.ts"), semantic);
  record("semantic-typescript", cli("sync"), 58);
  checkSource("sample.ts", semantic, "salute");
  await mkdir(join(project, "renamed"));
  for (const fixture of LANGUAGE_NONEMPTY_FIXTURES) {
    await rename(join(project, fixture.filePath), join(project, "renamed", fixture.filePath));
  }
  record("rename-58-languages", cli("sync"), 58);
  const renamedFiles = cli("files", "--limit", "100");
  assert(renamedFiles.files.every(f => f.filePath.startsWith("renamed/")));
  checkSource("renamed/sample.ts", semantic, "salute");
  for (const fixture of LANGUAGE_NONEMPTY_FIXTURES) {
    await rm(join(project, "renamed", fixture.filePath));
  }
  record("delete-58-languages", cli("sync"), 0);
  for (const fixture of LANGUAGE_NONEMPTY_FIXTURES) {
    await writeFile(join(project, fixture.filePath), fixture.sourceText);
  }
  const restored = record("restore-58-languages", cli("sync"), 58);
  assert.equal(checkSource("sample.ts", original, "greet"), originalHash);
  const reopened = record("reopen-separate-cli-process", cli("status"), 58);
  assert.equal(reopened.generationId, restored.generationId);
  await writeFile(join(project, "tsconfig.json"), '{"compilerOptions": ');
  let invalidConfigError = null;
  try { cli("sync"); } catch (error) {
    assert.equal(error.status, 1);
    invalidConfigError = String(error.stderr || error.stdout || error.message);
    assert.match(invalidConfigError, /config|json|expected/iu);
  }
  assert.notEqual(invalidConfigError, null, "invalid config must fail closed");
  await rm(join(project, "tsconfig.json"));
  const unchanged = cli("status");
  assert.equal(unchanged.generationId, restored.generationId, "invalid config must not publish");
  stages.push({ name: "invalid-config-no-publication", generationId: unchanged.generationId, error: invalidConfigError, passed: true });
  record("config-restore", cli("sync"), 58);
  assert.equal(checkSource("sample.ts", original, "greet"), originalHash);
  const report = {
    schemaVersion: 1,
    benchmark: "nonempty-depth-cli-lifecycle",
    generatedAt: new Date().toISOString(),
    methodology: "Real CLI and persisted SQLite: 58-language fresh/rename/delete/restore; TypeScript comment/semantic source checks; each read reopens in a separate process. Not all syntax mutations in all languages.",
    stages,
    passed: stages.length === 10 && stages.every(s => s.passed)
  };
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex !== -1) {
    assert(process.argv[outputIndex + 1], "--output requires a path");
    await writeFile(resolve(root, process.argv[outputIndex + 1]), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  assert(dirname(project) === workspace && workspace.startsWith(join(tmpdir(), "symbollattice-nonempty-lifecycle-")));
  await rm(workspace, { recursive: true, force: true });
}
