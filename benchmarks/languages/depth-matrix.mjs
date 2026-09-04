import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { summarizeLanguageDepthMatrix, LANGUAGE_DEPTH_MATRIX } from "../../dist/domain/language-depth.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../../dist/domain/facts.js";
import { ARTIFACT_LANGUAGES } from "../../dist/domain/types.js";
import { extractFileFacts } from "../../dist/extraction/index.js";
import { FRAMEWORK_CAPABILITIES } from "../../dist/extraction/framework-capabilities.js";
import {
  DISCOVERABLE_LANGUAGES,
  SUPPORTED_EXTENSIONS,
  getSourceLanguage
} from "../../dist/infrastructure/filesystem/discovery.js";
import { FileSystemSourceCatalog } from "../../dist/infrastructure/filesystem/source-catalog.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const git = (...args) => execFileSync(
  "git",
  ["-c", `safe.directory=${ROOT.replaceAll("\\", "/")}`, ...args],
  { cwd: ROOT, encoding: "utf8" }
).trim();

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function primaryPath(language, firstExtension) {
  return language === "blade"
    ? "sample.blade.php"
    : `sample-${language}${firstExtension.get(language) ?? ""}`;
}

function frameworkCapabilitiesByLanguage() {
  const result = new Map();
  for (const capability of FRAMEWORK_CAPABILITIES) {
    for (const language of capability.languages) {
      const entries = result.get(language) ?? [];
      entries.push(capability.id);
      result.set(language, entries);
    }
  }
  return result;
}

async function languageTestEvidence() {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && /\.test\.(?:ts|mjs)$/u.test(entry.name)) {
        files.push(path);
      }
    }
  }
  await visit(join(ROOT, "test"));
  const contents = await Promise.all(files.map(async (path) => ({
    path,
    source: await readFile(path, "utf8")
  })));
  return new Map(ARTIFACT_LANGUAGES.map((language) => {
    const pattern = new RegExp(`language\\s*:\\s*[\"']${language}[\"']`, "u");
    const paths = contents
      .filter(({ source }) => pattern.test(source))
      .map(({ path }) => path.slice(ROOT.length + 1).replaceAll("\\", "/"));
    return [language, paths];
  }));
}

export async function buildLanguageDepthReport() {
  const firstExtension = new Map();
  for (const [extension, language] of SUPPORTED_EXTENSIONS) {
    if (!firstExtension.has(language)) firstExtension.set(language, extension);
  }
  const frameworks = frameworkCapabilitiesByLanguage();
  const tests = await languageTestEvidence();
  const temporaryProject = await mkdtemp(join(tmpdir(), "symbollattice-language-depth-"));
  const extractionRows = [];
  try {
    for (const language of ARTIFACT_LANGUAGES) {
      const filePath = primaryPath(language, firstExtension);
      await writeFile(join(temporaryProject, filePath), "", "utf8");
      const discoveredLanguage = getSourceLanguage(filePath, "");
      let fileIdentity = false;
      let extractionError = null;
      try {
        const facts = extractFileFacts({
          filePath,
          language,
          sourceText: "",
          ...(language === "shell" || language === "lua"
            ? { sourceBytes: new Uint8Array() }
            : {})
        });
        fileIdentity = facts.symbols.some(
          (symbol) => symbol.kind === "file" && symbol.filePath === filePath
        );
      } catch (error) {
        extractionError = error instanceof Error ? error.message : String(error);
      }
      extractionRows.push({ language, filePath, discoveredLanguage, fileIdentity, extractionError });
    }

    const scan = await new FileSystemSourceCatalog().scan(temporaryProject);
    const scannedByLanguage = new Map(
      scan.sourceDocuments.map((document) => [document.language, document.relativePath])
    );
    const matrix = LANGUAGE_DEPTH_MATRIX.map((entry) => {
      const runtime = extractionRows.find(({ language }) => language === entry.language);
      return {
        ...entry,
        primaryPath: runtime?.filePath ?? null,
        discoveredLanguage: runtime?.discoveredLanguage ?? null,
        scannedPath: scannedByLanguage.get(entry.language) ?? null,
        fileIdentityVerified: runtime?.fileIdentity === true,
        extractionError: runtime?.extractionError ?? null,
        testEvidencePaths: tests.get(entry.language) ?? [],
        frameworkCapabilityIds: frameworks.get(entry.language) ?? []
      };
    });
    const failures = matrix.filter((entry) =>
      entry.discoveredLanguage !== entry.language ||
      entry.scannedPath !== entry.primaryPath ||
      entry.fileIdentityVerified !== true ||
      entry.extractionError !== null ||
      entry.testEvidencePaths.length === 0
    );
    const languageNames = LANGUAGE_DEPTH_MATRIX.map(({ language }) => language);
    const registryMatches = sameValues(languageNames, ARTIFACT_LANGUAGES);
    const discoveryMatches = new Set(DISCOVERABLE_LANGUAGES).size === ARTIFACT_LANGUAGES.length &&
      ARTIFACT_LANGUAGES.every((language) => DISCOVERABLE_LANGUAGES.includes(language));
    const summary = summarizeLanguageDepthMatrix(LANGUAGE_DEPTH_MATRIX);
    return {
      schemaVersion: 1,
      benchmark: "symbollattice-language-depth-matrix-v1",
      generatedAt: new Date().toISOString(),
      productVersion: SYMBOL_LATTICE_VERSION,
      product: {
        version: SYMBOL_LATTICE_VERSION,
        commit: git("rev-parse", "HEAD"),
        repositoryClean: git("status", "--porcelain") === "",
        extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
        resolverVersion: PROJECT_RESOLVER_VERSION
      },
      contract: {
        languageCount: ARTIFACT_LANGUAGES.length,
        extensionMappingCount: SUPPORTED_EXTENSIONS.size,
        specialDiscoveryRules: ["blade.php", "content-proven-c-or-objective-c-header", "exact-shell-shebang"],
        registryMatches,
        discoveryMatches
      },
      runtimeSmoke: {
        expectedLanguages: ARTIFACT_LANGUAGES.length,
        scannedDocuments: scan.sourceDocuments.length,
        fileIdentityPassed: matrix.filter(({ fileIdentityVerified }) => fileIdentityVerified).length,
        failures
      },
      frameworkCapabilities: {
        capabilities: FRAMEWORK_CAPABILITIES.length,
        languages: frameworks.size
      },
      testEvidence: {
        languagesWithEvidence: matrix.filter(({ testEvidencePaths }) => testEvidencePaths.length > 0).length,
        languagesWithoutEvidence: matrix
          .filter(({ testEvidencePaths }) => testEvidencePaths.length === 0)
          .map(({ language }) => language)
      },
      summary,
      matrix,
      passed:
        registryMatches &&
        discoveryMatches &&
        failures.length === 0 &&
        scan.sourceDocuments.length === ARTIFACT_LANGUAGES.length &&
        summary.languages === ARTIFACT_LANGUAGES.length
    };
  } finally {
    await rm(temporaryProject, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH;
if (invokedDirectly) {
  const report = await buildLanguageDepthReport();
  const output = argument("--output");
  if (output !== null) {
    await writeFile(resolve(ROOT, output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({
    output: output === null ? null : resolve(ROOT, output),
    productVersion: report.productVersion,
    product: report.product,
    languages: report.summary.languages,
    tiers: report.summary.tiers,
    relationDepth: report.summary.relationDepth,
    largeProjectValidated: report.summary.largeProjectValidated,
    relationReleaseValidated: report.summary.relationReleaseValidated,
    frameworkCapabilities: report.frameworkCapabilities,
    testEvidence: report.testEvidence,
    runtimeSmoke: report.runtimeSmoke,
    passed: report.passed
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
