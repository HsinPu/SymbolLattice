function requireRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function requireNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function requireUniqueStrings(values, label) {
  const seen = new Set();
  for (const value of values) {
    requireNonemptyString(value, label);
    if (seen.has(value)) {
      throw new Error(`${label} contains a duplicate value: ${value}`);
    }
    seen.add(value);
  }
  return [...values];
}

function validateCases(value, label) {
  const cases = requireArray(value, label).map((candidate, index) => {
    const record = requireRecord(candidate, `${label}[${index}]`);
    requireNonemptyString(record.id, `${label}[${index}].id`);
    requireNonemptyString(record.language, `${label}[${index}].language`);
    requireNonemptyString(record.fixturePath, `${label}[${index}].fixturePath`);
    requireNonemptyString(record.expectedFilePath, `${label}[${index}].expectedFilePath`);
    if (record.expectedSymbol !== undefined && record.expectedSymbol !== null) {
      requireNonemptyString(record.expectedSymbol, `${label}[${index}].expectedSymbol`);
    }
    requireRecord(record.relation, `${label}[${index}].relation`);
    return record;
  });
  requireUniqueStrings(cases.map((candidate) => candidate.id), `${label}.id`);
  return cases;
}

/**
 * Validates a committed smoke manifest against the live exported registries.
 * The manifest selects executable cases; it never becomes a second source of
 * truth for the complete set of languages or framework capabilities.
 */
export function createCapabilitySmokePlan(value, registriesValue) {
  const manifest = requireRecord(value, "manifest");
  const registries = requireRecord(registriesValue, "registries");
  if (manifest.schemaVersion !== 1) {
    throw new Error("manifest.schemaVersion must be 1.");
  }
  const matrixId = requireNonemptyString(manifest.matrixId, "manifest.matrixId");
  const artifactLanguages = requireUniqueStrings(
    requireArray(registries.artifactLanguages, "registries.artifactLanguages"),
    "registries.artifactLanguages"
  );
  const discoverableLanguages = new Set(
    requireUniqueStrings(
      requireArray(registries.discoverableLanguages, "registries.discoverableLanguages"),
      "registries.discoverableLanguages"
    )
  );
  const frameworkCapabilityIds = requireUniqueStrings(
    requireArray(registries.frameworkCapabilityIds, "registries.frameworkCapabilityIds"),
    "registries.frameworkCapabilityIds"
  );
  const registeredLanguageSet = new Set(artifactLanguages);
  const registeredFrameworkSet = new Set(frameworkCapabilityIds);
  const languageCases = validateCases(manifest.languageCases, "manifest.languageCases");
  const frameworkCases = validateCases(manifest.frameworkCases, "manifest.frameworkCases");

  for (const candidate of [...languageCases, ...frameworkCases]) {
    if (!registeredLanguageSet.has(candidate.language)) {
      throw new Error(`Case ${candidate.id} language is not registered: ${candidate.language}`);
    }
    if (!discoverableLanguages.has(candidate.language)) {
      throw new Error(`Case ${candidate.id} language is not discoverable: ${candidate.language}`);
    }
  }
  for (const candidate of frameworkCases) {
    requireNonemptyString(candidate.framework, `Framework case ${candidate.id}.framework`);
    if (candidate.capabilityId !== null && candidate.capabilityId !== undefined) {
      requireNonemptyString(candidate.capabilityId, `Framework case ${candidate.id}.capabilityId`);
      if (!registeredFrameworkSet.has(candidate.capabilityId)) {
        throw new Error(
          `Framework case ${candidate.id} capability is not registered: ${candidate.capabilityId}`
        );
      }
    }
  }

  const selectedLanguageSet = new Set(languageCases.map((candidate) => candidate.language));
  const selectedFrameworkSet = new Set(
    frameworkCases
      .map((candidate) => candidate.capabilityId)
      .filter((candidate) => typeof candidate === "string")
  );

  return {
    schemaVersion: 1,
    matrixId,
    registryCoverage: {
      languages: {
        registered: artifactLanguages,
        selected: artifactLanguages.filter((language) => selectedLanguageSet.has(language)),
        deferred: artifactLanguages.filter((language) => !selectedLanguageSet.has(language))
      },
      frameworks: {
        registered: frameworkCapabilityIds,
        selected: frameworkCapabilityIds.filter((id) => selectedFrameworkSet.has(id)),
        deferred: frameworkCapabilityIds.filter((id) => !selectedFrameworkSet.has(id))
      }
    },
    languageCases,
    frameworkCases
  };
}

/** Classifies one complete, observable application-flow receipt. */
export function classifyCapabilitySmokeStages(stagesValue) {
  const stages = requireRecord(stagesValue, "stages");
  for (const name of ["init", "noOpSync", "changedSync", "files", "symbol", "relation"]) {
    if (typeof stages[name] !== "boolean") {
      throw new Error(`stages.${name} must be boolean.`);
    }
  }
  if (!stages.init || !stages.noOpSync || !stages.changedSync || !stages.files) {
    return "unavailable";
  }
  if (!stages.symbol) {
    return "scan-only";
  }
  if (!stages.relation) {
    return "partial-usable";
  }
  return "basic-usable";
}

function generationId(value) {
  return typeof value?.generationId === "string" && value.generationId.length > 0
    ? value.generationId
    : null;
}

function commandError(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Runs one isolated, real application-flow case through an injected CLI runtime. */
export async function runCapabilitySmokeCase(candidateValue, kind, runtimeValue) {
  const candidate = requireRecord(candidateValue, "candidate");
  const runtime = requireRecord(runtimeValue, "runtime");
  if (kind !== "language" && kind !== "framework") {
    throw new Error("kind must be language or framework.");
  }
  for (const method of ["prepareProject", "mutate", "cleanup", "runJson"]) {
    if (typeof runtime[method] !== "function") {
      throw new Error(`runtime.${method} must be a function.`);
    }
  }

  const stages = {
    init: false,
    noOpSync: false,
    changedSync: false,
    files: false,
    symbol: false,
    relation: false
  };
  const evidence = {
    initialGenerationId: null,
    noOpGenerationId: null,
    changedGenerationId: null,
    filePath: null,
    symbolName: null,
    relation: null
  };
  const errors = [];
  let projectPath = null;

  try {
    projectPath = await runtime.prepareProject(candidate);
    requireNonemptyString(projectPath, "runtime.prepareProject result");

    try {
      const result = await runtime.runJson("init", ["--project", projectPath, "--json"]);
      evidence.initialGenerationId = generationId(result);
      stages.init =
        result?.initialized === true &&
        result?.stale === false &&
        evidence.initialGenerationId !== null;
      if (!stages.init) {
        errors.push({ stage: "init", message: "init did not publish a fresh generation." });
      }
    } catch (error) {
      errors.push({ stage: "init", message: commandError(error) });
    }

    if (stages.init) {
      try {
        const result = await runtime.runJson("sync", ["--project", projectPath, "--json"]);
        evidence.noOpGenerationId = generationId(result);
        stages.noOpSync =
          result?.stale === false &&
          evidence.noOpGenerationId === evidence.initialGenerationId;
        if (!stages.noOpSync) {
          errors.push({
            stage: "noOpSync",
            message: "no-op sync did not preserve the fresh active generation."
          });
        }
      } catch (error) {
        errors.push({ stage: "noOpSync", message: commandError(error) });
      }
    }

    if (stages.noOpSync) {
      try {
        await runtime.mutate(projectPath, candidate);
        const result = await runtime.runJson("sync", ["--project", projectPath, "--json"]);
        evidence.changedGenerationId = generationId(result);
        stages.changedSync =
          result?.stale === false &&
          evidence.changedGenerationId !== null &&
          evidence.changedGenerationId !== evidence.initialGenerationId;
        if (!stages.changedSync) {
          errors.push({
            stage: "changedSync",
            message: "changed sync did not publish a new fresh generation."
          });
        }
      } catch (error) {
        errors.push({ stage: "changedSync", message: commandError(error) });
      }
    }

    if (stages.changedSync) {
      try {
        const result = await runtime.runJson("files", [
          "--project",
          projectPath,
          "--json",
          "--language",
          candidate.language,
          "--limit",
          "100"
        ]);
        const file = Array.isArray(result?.files)
          ? result.files.find(
              (item) =>
                item?.filePath === candidate.expectedFilePath && item?.language === candidate.language
            )
          : undefined;
        stages.files = file !== undefined;
        evidence.filePath = file?.filePath ?? null;
        if (!stages.files) {
          errors.push({
            stage: "files",
            message: `files did not return ${candidate.expectedFilePath} as ${candidate.language}.`
          });
        }
      } catch (error) {
        errors.push({ stage: "files", message: commandError(error) });
      }
    }

    if (stages.files) {
      if (candidate.expectedSymbol === null || candidate.expectedSymbol === undefined) {
        stages.symbol = true;
      } else {
        try {
          const result = await runtime.runJson("find", [
            candidate.expectedSymbol,
            "--project",
            projectPath,
            "--json",
            "--limit",
            "20"
          ]);
          const symbol = Array.isArray(result?.symbols)
            ? result.symbols.find((item) => item?.name === candidate.expectedSymbol)
            : undefined;
          stages.symbol = symbol !== undefined;
          evidence.symbolName = symbol?.name ?? null;
          if (!stages.symbol) {
            errors.push({
              stage: "symbol",
              message: `find did not return ${candidate.expectedSymbol}.`
            });
          }
        } catch (error) {
          errors.push({ stage: "symbol", message: commandError(error) });
        }
      }
    }

    if (stages.symbol) {
      const relation = requireRecord(candidate.relation, `Case ${candidate.id}.relation`);
      try {
        if (relation.command === "callees") {
          const result = await runtime.runJson("callees", [
            requireNonemptyString(relation.reference, `Case ${candidate.id}.relation.reference`),
            "--project",
            projectPath,
            "--json"
          ]);
          const target = Array.isArray(result?.relations)
            ? result.relations.find(
                (item) => item?.symbol?.name === relation.expectedTarget
              )
            : undefined;
          stages.relation = target !== undefined;
          evidence.relation = target?.symbol?.name ?? null;
        } else if (relation.command === "routes") {
          const result = await runtime.runJson("routes", [
            "--project",
            projectPath,
            "--json",
            "--limit",
            "100"
          ]);
          const route = Array.isArray(result?.routes)
            ? result.routes.find(
                (item) =>
                  item?.path === relation.expectedPath &&
                  (relation.expectedMethod === undefined || item?.method === relation.expectedMethod)
              )
            : undefined;
          stages.relation = route !== undefined;
          evidence.relation = route === undefined ? null : `${route.method} ${route.path}`;
        } else {
          throw new Error(`Unsupported relation command: ${relation.command}`);
        }
        if (!stages.relation) {
          errors.push({
            stage: "relation",
            message: `Expected ${relation.command} relation was not returned.`
          });
        }
      } catch (error) {
        errors.push({ stage: "relation", message: commandError(error) });
      }
    }
  } catch (error) {
    errors.push({ stage: "prepare", message: commandError(error) });
  } finally {
    if (projectPath !== null) {
      try {
        await runtime.cleanup(projectPath);
      } catch (error) {
        errors.push({ stage: "cleanup", message: commandError(error) });
      }
    }
  }

  return {
    id: candidate.id,
    kind,
    language: candidate.language,
    ...(kind === "framework"
      ? {
          framework: candidate.framework,
          capabilityId: candidate.capabilityId ?? null
        }
      : {}),
    classification: classifyCapabilitySmokeStages(stages),
    stages,
    evidence,
    errors
  };
}

function parseArguments(argv) {
  const result = { manifestPath: null, outputPath: null, keepTemporaryProjects: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest" || argument === "--output") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}.`);
      }
      const key = argument === "--manifest" ? "manifestPath" : "outputPath";
      if (result[key] !== null) {
        throw new Error(`Duplicate argument: ${argument}`);
      }
      result[key] = value;
      index += 1;
      continue;
    }
    if (argument === "--keep-temporary-projects") {
      if (result.keepTemporaryProjects) {
        throw new Error("Duplicate argument: --keep-temporary-projects");
      }
      result.keepTemporaryProjects = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function requirePathInside(rootPath, targetPath, label) {
  const normalizedRoot = resolve(rootPath);
  const normalizedTarget = resolve(targetPath);
  const relativePath = relative(normalizedRoot, normalizedTarget);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${label} must resolve inside ${normalizedRoot}.`);
  }
  return normalizedTarget;
}

function parseJsonOutput(stdout, command) {
  const text = stdout.trim();
  if (text.length === 0) {
    throw new Error(`${command} returned empty stdout.`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${command} returned invalid JSON: ${commandError(error)}`);
  }
  return requireRecord(value, `${command} JSON output`);
}

export function createCliRuntime(options) {
  const projectRoot = resolve(options.projectRoot);
  const fixtureRoot = resolve(projectRoot, "benchmark", "capability-smoke-matrix", "fixtures");
  const cliEntryPath = resolve(options.cliEntryPath);
  const retainedProjects = [];

  return {
    retainedProjects,
    async prepareProject(candidate) {
      const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-capability-smoke-"));
      try {
        const fixturePath = requirePathInside(
          fixtureRoot,
          resolve(projectRoot, candidate.fixturePath),
          `Case ${candidate.id}.fixturePath`
        );
        const metadata = await stat(fixturePath);
        if (metadata.isDirectory()) {
          await cp(fixturePath, projectPath, { recursive: true });
        } else if (metadata.isFile()) {
          const destination = requirePathInside(
            projectPath,
            resolve(projectPath, ...candidate.expectedFilePath.split("/")),
            `Case ${candidate.id}.expectedFilePath`
          );
          await mkdir(dirname(destination), { recursive: true });
          await copyFile(fixturePath, destination);
        } else {
          throw new Error(`Case ${candidate.id} fixture is not a file or directory.`);
        }
        return projectPath;
      } catch (error) {
        try {
          await rm(projectPath, { recursive: true, force: true });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            `Case ${candidate.id} fixture preparation and cleanup both failed.`
          );
        }
        throw error;
      }
    },
    async mutate(projectPath, candidate) {
      const mutationPath = requirePathInside(
        projectPath,
        resolve(projectPath, ...(candidate.mutationPath ?? candidate.expectedFilePath).split("/")),
        `Case ${candidate.id}.mutationPath`
      );
      await appendFile(mutationPath, "\n", "utf8");
    },
    async cleanup(projectPath) {
      if (options.keepTemporaryProjects) {
        retainedProjects.push(projectPath);
        return;
      }
      await rm(projectPath, { recursive: true, force: true });
    },
    async runJson(command, arguments_) {
      const { stdout } = await execFileAsync(
        process.execPath,
        [cliEntryPath, command, ...arguments_],
        {
          cwd: projectRoot,
          env: { ...process.env, NO_COLOR: "1" },
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true
        }
      );
      return parseJsonOutput(stdout, command);
    }
  };
}

async function main(argv) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const options = parseArguments(argv);
  const manifestPath = resolve(
    projectRoot,
    options.manifestPath ?? "benchmark/capability-smoke-matrix/manifest.json"
  );
  const outputPath =
    options.outputPath === null ? null : resolve(projectRoot, options.outputPath);
  const cliEntryPath = resolve(projectRoot, "dist", "cli", "main.js");
  const [manifestText, packageText, domain, filesystem, extraction] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(resolve(projectRoot, "package.json"), "utf8"),
    import(pathToFileURL(resolve(projectRoot, "dist", "domain", "index.js")).href),
    import(pathToFileURL(resolve(projectRoot, "dist", "infrastructure", "filesystem", "index.js")).href),
    import(pathToFileURL(resolve(projectRoot, "dist", "extraction", "index.js")).href)
  ]);
  const manifest = JSON.parse(manifestText);
  const packageJson = JSON.parse(packageText);
  const discoverableLanguages = [
    ...new Set([...filesystem.SUPPORTED_EXTENSIONS.values()])
  ];
  const plan = createCapabilitySmokePlan(manifest, {
    artifactLanguages: domain.ARTIFACT_LANGUAGES,
    discoverableLanguages,
    frameworkCapabilityIds: extraction.FRAMEWORK_CAPABILITY_IDS
  });
  const runtime = createCliRuntime({
    projectRoot,
    cliEntryPath,
    keepTemporaryProjects: options.keepTemporaryProjects
  });
  const cases = [];
  for (const candidate of plan.languageCases) {
    cases.push(await runCapabilitySmokeCase(candidate, "language", runtime));
  }
  for (const candidate of plan.frameworkCases) {
    cases.push(await runCapabilitySmokeCase(candidate, "framework", runtime));
  }
  const classifications = ["basic-usable", "partial-usable", "scan-only", "unavailable"];
  const summary = Object.fromEntries(
    classifications.map((classification) => [
      classification,
      cases.filter((candidate) => candidate.classification === classification).length
    ])
  );
  const result = {
    schemaVersion: 1,
    matrixId: plan.matrixId,
    generatedAt: new Date().toISOString(),
    package: { name: packageJson.name, version: packageJson.version },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    registryCoverage: plan.registryCoverage,
    selectedCases: {
      languages: plan.languageCases.length,
      frameworks: plan.frameworkCases.length
    },
    summary,
    cases,
    retainedTemporaryProjects: runtime.retainedProjects
  };

  if (outputPath === null) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(
      `${JSON.stringify({ outputPath, summary, selectedCases: result.selectedCases }, null, 2)}\n`
    );
  }
  if (summary.unavailable > 0) {
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (entryPath === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${commandError(error)}\n`);
    process.exitCode = 1;
  });
}
import { execFile } from "node:child_process";
import {
  appendFile,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
