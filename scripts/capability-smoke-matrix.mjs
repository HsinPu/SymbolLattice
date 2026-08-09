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

function validateNotApplicable(value, label) {
  const notApplicable = requireRecord(value, label);
  requireNonemptyString(notApplicable.reason, `${label}.reason`);
  return { reason: notApplicable.reason };
}

function validateV2Assertions(value, label, profile) {
  const assertions = requireRecord(value, label);
  const symbols = requireArray(assertions.symbols, `${label}.symbols`).map((candidate, index) => {
    const assertionLabel = `${label}.symbols[${index}]`;
    const record = requireRecord(candidate, assertionLabel);
    requireNonemptyString(record.id, `${assertionLabel}.id`);
    if (record.notApplicable !== undefined) {
      validateNotApplicable(record.notApplicable, `${assertionLabel}.notApplicable`);
      return { id: record.id, notApplicable: { reason: record.notApplicable.reason } };
    }
    return {
      id: record.id,
      name: requireNonemptyString(record.name, `${assertionLabel}.name`),
      filePath: requireNonemptyString(record.filePath, `${assertionLabel}.filePath`),
      kind: requireNonemptyString(record.kind, `${assertionLabel}.kind`)
    };
  });
  const symbolsById = new Map(symbols.map((assertion) => [assertion.id, assertion]));
  const relations = requireArray(assertions.relations, `${label}.relations`).map((candidate, index) => {
    const assertionLabel = `${label}.relations[${index}]`;
    const record = requireRecord(candidate, assertionLabel);
    requireNonemptyString(record.id, `${assertionLabel}.id`);
    if (record.notApplicable !== undefined) {
      validateNotApplicable(record.notApplicable, `${assertionLabel}.notApplicable`);
      return { id: record.id, notApplicable: { reason: record.notApplicable.reason } };
    }
    const command = requireNonemptyString(record.command, `${assertionLabel}.command`);
    if (command === "callees") {
      const source = requireNonemptyString(record.source, `${assertionLabel}.source`);
      const target = requireNonemptyString(record.target, `${assertionLabel}.target`);
      if (!symbolsById.has(source) || symbolsById.get(source)?.notApplicable !== undefined) {
        throw new Error(`${assertionLabel}.source must reference an applicable symbol assertion.`);
      }
      if (!symbolsById.has(target) || symbolsById.get(target)?.notApplicable !== undefined) {
        throw new Error(`${assertionLabel}.target must reference an applicable symbol assertion.`);
      }
      return {
        id: record.id,
        command,
        source,
        target,
        kind: requireNonemptyString(record.kind, `${assertionLabel}.kind`)
      };
    }
    if (command === "hierarchy" || command === "impact") {
      const source = requireNonemptyString(record.source, `${assertionLabel}.source`);
      const target = requireNonemptyString(record.target, `${assertionLabel}.target`);
      if (!symbolsById.has(source) || symbolsById.get(source)?.notApplicable !== undefined) {
        throw new Error(`${assertionLabel}.source must reference an applicable symbol assertion.`);
      }
      if (!symbolsById.has(target) || symbolsById.get(target)?.notApplicable !== undefined) {
        throw new Error(`${assertionLabel}.target must reference an applicable symbol assertion.`);
      }
      return {
        id: record.id,
        command,
        source,
        target,
        kind: requireNonemptyString(record.kind, `${assertionLabel}.kind`)
      };
    }
    if (command === "file-dependents") {
      return {
        id: record.id,
        command,
        sourceFile: requireNonemptyString(record.sourceFile, `${assertionLabel}.sourceFile`),
        targetFile: requireNonemptyString(record.targetFile, `${assertionLabel}.targetFile`),
        kind: requireNonemptyString(record.kind, `${assertionLabel}.kind`)
      };
    }
    if (command === "routes") {
      const target = record.target === undefined
        ? undefined
        : requireNonemptyString(record.target, `${assertionLabel}.target`);
      if (profile === "language" && target === undefined) {
        throw new Error(`${assertionLabel}.target is required for a language route assertion.`);
      }
      if (
        target !== undefined &&
        (!symbolsById.has(target) || symbolsById.get(target)?.notApplicable !== undefined)
      ) {
        throw new Error(`${assertionLabel}.target must reference an applicable symbol assertion.`);
      }
      return {
        id: record.id,
        command,
        ...(target === undefined ? {} : { target }),
        expectedPath: requireNonemptyString(record.expectedPath, `${assertionLabel}.expectedPath`),
        ...(record.expectedMethod === undefined
          ? {}
          : { expectedMethod: requireNonemptyString(record.expectedMethod, `${assertionLabel}.expectedMethod`) })
      };
    }
    throw new Error(`${assertionLabel}.command is unsupported: ${command}`);
  });
  requireUniqueStrings(
    [...symbols, ...relations].map((assertion) => assertion.id),
    `${label}.id`
  );
  if (profile === "language") {
    if (!symbols.some((assertion) => assertion.notApplicable === undefined)) {
      throw new Error(`${label} must include at least one required symbol assertion.`);
    }
    if (!relations.some(
      (assertion) =>
        assertion.notApplicable === undefined &&
        ["callees", "hierarchy", "impact", "file-dependents", "routes"].includes(assertion.command)
    )) {
      throw new Error(`${label} must include at least one required language relation assertion.`);
    }
  }
  return { symbols, relations };
}

function validateCases(value, label, schemaVersion, profile) {
  const cases = requireArray(value, label).map((candidate, index) => {
    const record = requireRecord(candidate, `${label}[${index}]`);
    requireNonemptyString(record.id, `${label}[${index}].id`);
    requireNonemptyString(record.language, `${label}[${index}].language`);
    requireNonemptyString(record.fixturePath, `${label}[${index}].fixturePath`);
    requireNonemptyString(record.expectedFilePath, `${label}[${index}].expectedFilePath`);
    if (schemaVersion === 2) {
      return {
        ...record,
        assertions: validateV2Assertions(record.assertions, `${label}[${index}].assertions`, profile)
      };
    }
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
  if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) {
    throw new Error("manifest.schemaVersion must be 1 or 2.");
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
  const languageCases = validateCases(
    manifest.languageCases,
    "manifest.languageCases",
    manifest.schemaVersion,
    "language"
  );
  const frameworkCases = validateCases(
    manifest.frameworkCases,
    "manifest.frameworkCases",
    manifest.schemaVersion,
    "framework"
  );

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
    schemaVersion: manifest.schemaVersion,
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

function sameSymbolIdentity(actual, expected) {
  return (
    actual?.id === expected?.id &&
    actual?.name === expected?.name &&
    actual?.filePath === expected?.filePath &&
    actual?.kind === expected?.kind
  );
}

function requireRuntimeSchemaVersion(value) {
  if (value === undefined) {
    return 1;
  }
  if (value !== 1 && value !== 2) {
    throw new Error("schemaVersion must be 1 or 2.");
  }
  return value;
}

export function capabilitySmokeFailureSummary(casesValue) {
  const cases = requireArray(casesValue, "cases");
  const failedCases = cases.map((candidate, index) => {
    const receipt = requireRecord(candidate, `cases[${index}]`);
    const errors = requireArray(receipt.errors, `cases[${index}].errors`);
    const integrityErrors = errors.filter(
      (error) => error?.failureKind === "cleanup" || error?.failureKind === "runner"
    );
    const paths = [
      ...(receipt.classification === "unavailable" ? ["classification.unavailable"] : []),
      ...integrityErrors.map((error) => `errors.${error.stage}`)
    ];
    return { id: receipt.id, paths, errors: integrityErrors };
  }).filter((candidate) => candidate.paths.length > 0);
  return {
    failedCases: failedCases.length,
    errorCount: failedCases.reduce((total, candidate) => total + candidate.errors.length, 0),
    cases: failedCases
  };
}

export function capabilitySmokeExitCode(failureSummaryValue) {
  const failureSummary = requireRecord(failureSummaryValue, "failureSummary");
  if (!Number.isInteger(failureSummary.failedCases) || failureSummary.failedCases < 0) {
    throw new Error("failureSummary.failedCases must be a nonnegative integer.");
  }
  return failureSummary.failedCases > 0 ? 1 : 0;
}

/** Runs one isolated, real application-flow case through an injected CLI runtime. */
export async function runCapabilitySmokeCase(candidateValue, kind, runtimeValue, schemaVersionValue) {
  const candidate = requireRecord(candidateValue, "candidate");
  const runtime = requireRecord(runtimeValue, "runtime");
  const schemaVersion = requireRuntimeSchemaVersion(schemaVersionValue);
  if (schemaVersion === 1 && candidate.assertions !== undefined) {
    throw new Error("schemaVersion 1 cases must not include assertions.");
  }
  const assertions = schemaVersion === 2
    ? validateV2Assertions(candidate.assertions, `Case ${candidate.id}.assertions`, kind)
    : null;
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
  const assertionReceipts = assertions === null
    ? null
    : {
        symbols: assertions.symbols.map((assertion) => ({
          id: assertion.id,
          status: assertion.notApplicable === undefined ? "pending" : "not-applicable",
          ...(assertion.notApplicable === undefined
            ? {
                expected: {
                  name: assertion.name,
                  filePath: assertion.filePath,
                  kind: assertion.kind
                },
                actualId: null
              }
            : { reason: assertion.notApplicable.reason })
        })),
        relations: assertions.relations.map((assertion) => ({
          id: assertion.id,
          status: assertion.notApplicable === undefined ? "pending" : "not-applicable",
          ...(assertion.notApplicable === undefined
            ? { command: assertion.command }
            : { reason: assertion.notApplicable.reason })
        }))
      };
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

    if (stages.files && assertions !== null) {
      const resolvedSymbols = new Map();
      for (const [index, assertion] of assertions.symbols.entries()) {
        if (assertion.notApplicable !== undefined) {
          continue;
        }
        const receipt = assertionReceipts.symbols[index];
        try {
          const result = await runtime.runJson("find", [
            assertion.name,
            "--project",
            projectPath,
            "--json",
            "--limit",
            "20"
          ]);
          const matches = Array.isArray(result?.symbols)
            ? result.symbols.filter(
                (item) =>
                  item?.name === assertion.name &&
                  item?.filePath === assertion.filePath &&
                  item?.kind === assertion.kind &&
                  typeof item?.id === "string" &&
                  item.id.length > 0
              )
            : [];
          if (matches.length === 1) {
            const [symbol] = matches;
            receipt.status = "passed";
            receipt.actualId = symbol.id;
            resolvedSymbols.set(assertion.id, symbol);
            evidence.symbolName ??= symbol.name;
          } else {
            receipt.status = "failed";
            receipt.message = `find returned ${matches.length} exact identities for ${assertion.id}.`;
            errors.push({ stage: "symbol", assertionId: assertion.id, message: receipt.message });
          }
        } catch (error) {
          receipt.status = "failed";
          receipt.message = commandError(error);
          errors.push({
            stage: "symbol",
            assertionId: assertion.id,
            message: receipt.message,
            failureKind: "runner"
          });
        }
      }
      stages.symbol = assertions.symbols
        .filter((assertion) => assertion.notApplicable === undefined)
        .every((assertion) => resolvedSymbols.has(assertion.id));
      const assertionsByActualId = new Map();
      for (const [assertionId, symbol] of resolvedSymbols) {
        const assertionIds = assertionsByActualId.get(symbol.id) ?? [];
        assertionIds.push(assertionId);
        assertionsByActualId.set(symbol.id, assertionIds);
      }
      for (const [actualId, assertionIds] of assertionsByActualId) {
        if (assertionIds.length < 2) {
          continue;
        }
        for (const assertionId of assertionIds) {
          const receipt = assertionReceipts.symbols.find((candidate) => candidate.id === assertionId);
          receipt.status = "failed";
          receipt.message = `Exact symbol identity ${actualId} was selected by multiple assertions.`;
          resolvedSymbols.delete(assertionId);
          errors.push({ stage: "symbol", assertionId, message: receipt.message });
        }
      }
      stages.symbol = assertions.symbols
        .filter((assertion) => assertion.notApplicable === undefined)
        .every((assertion) => resolvedSymbols.has(assertion.id));

      const requiredRelations = assertions.relations.filter(
        (assertion) => assertion.notApplicable === undefined
      );
      if (stages.symbol) {
        for (const [index, assertion] of assertions.relations.entries()) {
          if (assertion.notApplicable !== undefined) {
            continue;
          }
          const receipt = assertionReceipts.relations[index];
          try {
            if (assertion.command === "callees") {
              const source = resolvedSymbols.get(assertion.source);
              const target = resolvedSymbols.get(assertion.target);
              if (source === undefined || target === undefined) {
                throw new Error("Relation symbols were not resolved by exact identity.");
              }
              const result = await runtime.runJson("callees", [
                source.id,
                "--project",
                projectPath,
                "--json"
              ]);
              receipt.rootId = result?.symbol?.id ?? null;
              receipt.targetId = target.id;
              const matches = Array.isArray(result?.relations)
                ? result.relations.filter(
                    (item) =>
                      sameSymbolIdentity(result?.symbol, source) &&
                      sameSymbolIdentity(item?.symbol, target) &&
                      item?.edge?.sourceId === source.id &&
                      item?.edge?.targetId === target.id &&
                      item?.edge?.kind === assertion.kind
                  )
                : [];
              if (matches.length === 1) {
                const edge = matches[0].edge;
                receipt.status = "passed";
                receipt.edge = {
                  sourceId: edge.sourceId,
                  targetId: edge.targetId,
                  kind: edge.kind
                };
                evidence.relation ??= `${edge.kind} ${source.id} -> ${target.id}`;
              } else {
                receipt.status = "failed";
                receipt.message = `callees returned ${matches.length} exact edges for ${assertion.id}.`;
                errors.push({ stage: "relation", assertionId: assertion.id, message: receipt.message });
              }
            } else if (assertion.command === "hierarchy") {
              const source = resolvedSymbols.get(assertion.source);
              const target = resolvedSymbols.get(assertion.target);
              if (source === undefined || target === undefined) {
                throw new Error("Hierarchy symbols were not resolved by exact identity.");
              }
              const result = await runtime.runJson("hierarchy", [
                source.id,
                "--project",
                projectPath,
                "--json",
                "--limit",
                "100"
              ]);
              receipt.rootId = result?.symbol?.id ?? null;
              receipt.targetId = target.id;
              const matches = Array.isArray(result?.parents)
                ? result.parents.filter(
                    (item) =>
                      sameSymbolIdentity(result?.symbol, source) &&
                      sameSymbolIdentity(item?.parent, target) &&
                      item?.edge?.sourceId === source.id &&
                      item?.edge?.targetId === target.id &&
                      item?.edge?.kind === assertion.kind
                  )
                : [];
              if (matches.length === 1) {
                const edge = matches[0].edge;
                receipt.status = "passed";
                receipt.edge = {
                  sourceId: edge.sourceId,
                  targetId: edge.targetId,
                  kind: edge.kind
                };
                evidence.relation ??= `${edge.kind} ${source.id} -> ${target.id}`;
              } else {
                receipt.status = "failed";
                receipt.message = `hierarchy returned ${matches.length} exact edges for ${assertion.id}.`;
                errors.push({ stage: "relation", assertionId: assertion.id, message: receipt.message });
              }
            } else if (assertion.command === "impact") {
              const source = resolvedSymbols.get(assertion.source);
              const target = resolvedSymbols.get(assertion.target);
              if (source === undefined || target === undefined) {
                throw new Error("Impact endpoints were not resolved by exact identity.");
              }
              const result = await runtime.runJson("impact", [
                target.id,
                "--project",
                projectPath,
                "--json",
                "--depth",
                "1",
                "--limit",
                "100"
              ]);
              const matches = sameSymbolIdentity(result?.symbol, target) && Array.isArray(result?.paths)
                ? result.paths.filter((path) => {
                    const symbols = Array.isArray(path?.symbols) ? path.symbols : [];
                    const edges = Array.isArray(path?.edges) ? path.edges : [];
                    return symbols.length === 2 &&
                      sameSymbolIdentity(symbols[0], target) &&
                      sameSymbolIdentity(symbols[1], source) &&
                      edges.length === 1 &&
                      edges[0]?.sourceId === source.id &&
                      edges[0]?.targetId === target.id &&
                      edges[0]?.kind === assertion.kind &&
                      edges[0]?.resolution === "exact" &&
                      edges[0]?.confidence === 1;
                  })
                : [];
              if (matches.length === 1) {
                const edge = matches[0].edges[0];
                receipt.status = "passed";
                receipt.source = source;
                receipt.target = target;
                receipt.kind = edge.kind;
                evidence.relation ??= `${edge.kind} ${source.id} -> ${target.id}`;
              } else {
                receipt.status = "failed";
                receipt.message = `impact returned ${matches.length} exact edges for ${assertion.id}.`;
                errors.push({ stage: "relation", assertionId: assertion.id, message: receipt.message });
              }
            } else if (assertion.command === "file-dependents") {
              const result = await runtime.runJson("file", [
                assertion.targetFile,
                "--project",
                projectPath,
                "--json",
                "--symbols-only"
              ]);
              const matches = result?.selection?.filePath === assertion.targetFile &&
                Array.isArray(result?.dependents)
                ? result.dependents.filter(
                    (item) =>
                      item?.filePath === assertion.sourceFile &&
                      Array.isArray(item?.edgeKinds) &&
                      item.edgeKinds.includes(assertion.kind)
                  )
                : [];
              if (matches.length === 1) {
                receipt.status = "passed";
                receipt.sourceFile = assertion.sourceFile;
                receipt.targetFile = assertion.targetFile;
                receipt.kind = assertion.kind;
                receipt.edgeCount = matches[0].edgeCount;
                evidence.relation ??= `${assertion.kind} ${assertion.sourceFile} -> ${assertion.targetFile}`;
              } else {
                receipt.status = "failed";
                receipt.message = `file returned ${matches.length} exact dependents for ${assertion.id}.`;
                errors.push({ stage: "relation", assertionId: assertion.id, message: receipt.message });
              }
            } else if (assertion.command === "routes") {
              const target = assertion.target === undefined
                ? undefined
                : resolvedSymbols.get(assertion.target);
              if (assertion.target !== undefined && target === undefined) {
                throw new Error("Route handler was not resolved by exact identity.");
              }
              const result = await runtime.runJson("routes", [
                "--project",
                projectPath,
                "--json",
                "--limit",
                "100"
              ]);
              const matches = Array.isArray(result?.routes)
                ? result.routes.filter(
                    (item) =>
                      item?.path === assertion.expectedPath &&
                      (assertion.expectedMethod === undefined || item?.method === assertion.expectedMethod) &&
                      (target === undefined || (
                        sameSymbolIdentity(item?.handler, target) &&
                        typeof item?.route?.id === "string" &&
                        item.route.id.length > 0 &&
                        item?.edge?.sourceId === item.route.id &&
                        item?.edge?.targetId === target.id &&
                        item?.edge?.kind === "routes" &&
                        item?.edge?.resolution === "exact" &&
                        item?.edge?.confidence === 1
                      ))
                  )
                : [];
              if (matches.length === 1) {
                receipt.status = "passed";
                receipt.route = { method: matches[0].method, path: matches[0].path };
                if (target !== undefined) {
                  receipt.targetId = target.id;
                  receipt.edge = {
                    sourceId: matches[0].edge.sourceId,
                    targetId: matches[0].edge.targetId,
                    kind: matches[0].edge.kind,
                    resolution: matches[0].edge.resolution,
                    confidence: matches[0].edge.confidence
                  };
                }
                evidence.relation ??= `${matches[0].method} ${matches[0].path}`;
              } else {
                receipt.status = "failed";
                receipt.message = `routes returned ${matches.length} exact routes for ${assertion.id}.`;
                errors.push({ stage: "relation", assertionId: assertion.id, message: receipt.message });
              }
            }
          } catch (error) {
            receipt.status = "failed";
            receipt.message = commandError(error);
            errors.push({
              stage: "relation",
              assertionId: assertion.id,
              message: receipt.message,
              failureKind: "runner"
            });
          }
        }
      }
      stages.relation =
        requiredRelations.length > 0 &&
        requiredRelations.every(
          (assertion) =>
            assertionReceipts.relations.find((receipt) => receipt.id === assertion.id)?.status === "passed"
        );
    }

    if (stages.files && assertions === null) {
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
          errors.push({ stage: "symbol", message: commandError(error), failureKind: "runner" });
        }
      }
    }

    if (stages.symbol && assertions === null) {
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
        errors.push({ stage: "relation", message: commandError(error), failureKind: "runner" });
      }
    }
  } catch (error) {
    errors.push({ stage: "prepare", message: commandError(error), failureKind: "runner" });
  } finally {
    if (projectPath !== null) {
      try {
        await runtime.cleanup(projectPath);
      } catch (error) {
        errors.push({ stage: "cleanup", message: commandError(error), failureKind: "cleanup" });
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
    ...(assertionReceipts === null ? {} : { assertions: assertionReceipts }),
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
  const discoverableLanguages = filesystem.DISCOVERABLE_LANGUAGES;
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
    cases.push(await runCapabilitySmokeCase(candidate, "language", runtime, plan.schemaVersion));
  }
  for (const candidate of plan.frameworkCases) {
    cases.push(await runCapabilitySmokeCase(candidate, "framework", runtime, plan.schemaVersion));
  }
  const classifications = ["basic-usable", "partial-usable", "scan-only", "unavailable"];
  const summary = Object.fromEntries(
    classifications.map((classification) => [
      classification,
      cases.filter((candidate) => candidate.classification === classification).length
    ])
  );
  const failureSummary = capabilitySmokeFailureSummary(cases);
  const result = {
    schemaVersion: plan.schemaVersion,
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
    failureSummary,
    cases,
    retainedTemporaryProjects: runtime.retainedProjects
  };

  if (outputPath === null) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(
      `${JSON.stringify({ outputPath, summary, failureSummary, selectedCases: result.selectedCases }, null, 2)}\n`
    );
  }
  if (capabilitySmokeExitCode(failureSummary) !== 0) {
    process.exitCode = capabilitySmokeExitCode(failureSummary);
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
