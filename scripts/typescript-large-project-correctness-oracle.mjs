/**
 * A source-only correctness oracle for large TypeScript projects.
 *
 * This deliberately does not import SymbolLattice code or read its database.
 * `index-evidence` is consumed only after compiler truths have been selected.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";

export const ORACLE_VERSION = "typescript-large-project-correctness-oracle-v2";
export const DEFAULT_SEED = "symbol-lattice-v0.419.0-nest-v11.1.16-stage5";
export const DEFAULT_QUOTAS = Object.freeze({
  identity: 60,
  moduleImportExport: 60,
  callsInstantiates: 100,
  acceptsReturnsExtendsImplements: 50,
  crossLayerTestImpact: 30,
  negatives: 150
});

const text = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty text.`);
  return value;
};
const compare = (left, right) => left.localeCompare(right, "en");
const normalized = (project, fileName) => relative(project, fileName).split(sep).join("/");
export const stableSha256 = (value) => createHash("sha256").update(value).digest("hex");

export function parseOracleArguments(argv) {
  const options = { project: null, tsconfig: "tsconfig.json", seed: DEFAULT_SEED, manifest: null, indexEvidence: null, output: null };
  const names = new Map([["--project", "project"], ["--tsconfig", "tsconfig"], ["--seed", "seed"], ["--manifest", "manifest"], ["--index-evidence", "indexEvidence"], ["--output", "output"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]; const property = names.get(flag); const value = argv[index + 1];
    if (property === undefined) throw new Error(`Unknown argument: ${flag}`);
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    options[property] = value; index += 1;
  }
  if (options.project === null) throw new Error("--project is required.");
  if (options.manifest === null) throw new Error("--manifest is required.");
  if (options.indexEvidence === null) throw new Error("--index-evidence is required.");
  return options;
}

export function parseOracleManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("manifest must be an object.");
  const quotas = { ...DEFAULT_QUOTAS, ...(value.quotas ?? {}) };
  for (const [name, amount] of Object.entries(quotas)) if (!Number.isInteger(amount) || amount < 0) throw new Error(`manifest quota ${name} must be a nonnegative integer.`);
  return { schemaVersion: value.schemaVersion ?? 1, expectedCommit: value.expectedCommit ?? null, quotas, sourceFiles: Array.isArray(value.sourceFiles) ? [...value.sourceFiles].map((path) => text(path, "manifest sourceFiles")) : null };
}

function compilerConfiguration(project, tsconfig) {
  const configPath = isAbsolute(tsconfig) ? tsconfig : resolve(project, tsconfig);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project, undefined, configPath);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
  return parsed;
}

function sourceKey(symbol) { return `${symbol.filePath}:${symbol.range.start.line}:${symbol.range.start.column}:${symbol.kind}:${symbol.name}`; }
function descriptor(project, node, kind, name, sourceFile) {
  const locationNode = ts.isNamedDeclaration(node) && node.name !== undefined ? node.name : node;
  const position = sourceFile.getLineAndCharacterOfPosition(locationNode.getStart(sourceFile));
  return { filePath: normalized(project, sourceFile.fileName), name, kind, range: { start: { line: position.line + 1, column: position.character + 1 } } };
}
function declarationKind(node) {
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isMethodDeclaration(node)) return "method";
  // SymbolLattice deliberately exposes declarations and signatures through
  // the same public method kind. Overload/signature syntax is still retained
  // by the declaration range and ordinal rather than inventing another kind.
  if (ts.isMethodSignature(node)) return "method";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isVariableDeclaration(node)) return "variable";
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) return "variable";
  if (ts.isConstructorDeclaration(node)) return "method";
  return ts.SyntaxKind[node.kind].toLowerCase();
}
export function isGraphDeclaration(node) {
  return (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isFunctionDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ||
    ts.isConstructorDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) ||
    ts.isVariableDeclaration(node)) && (!ts.isNamedDeclaration(node) || node.name === undefined || ts.isIdentifier(node.name));
}
function graphDeclarationName(node) {
  return ts.isConstructorDeclaration(node) ? "constructor" : node.name?.getText(node.getSourceFile()) ?? null;
}
export function enclosingSourceGraphOwner(node) {
  let current = node.parent;
  let owner = null;
  while (current) {
    if (ts.isDecorator(current)) {
      let decorated = current.parent;
      while (ts.isParameter(decorated)) decorated = decorated.parent;
      if (isGraphDeclaration(decorated)) return decorated;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const carrier = current.parent;
      if ((ts.isVariableDeclaration(carrier) || ts.isPropertyDeclaration(carrier)) && isGraphDeclaration(carrier)) return carrier;
    }
    if (isGraphDeclaration(current)) { owner = current; break; }
    if (ts.isClassDeclaration(current) || ts.isInterfaceDeclaration(current)) { owner = current; break; }
    current = current.parent;
  }
  if (owner === null || !(ts.isVariableDeclaration(owner) || ts.isPropertyDeclaration(owner))) return owner;
  current = owner.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current) || ts.isMethodSignature(current) || ts.isConstructorDeclaration(current)) return current;
    if ((ts.isVariableDeclaration(current) || ts.isPropertyDeclaration(current)) &&
        current.initializer !== undefined &&
        (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer)) &&
        isGraphDeclaration(current)) return current;
    if (ts.isClassDeclaration(current) || ts.isInterfaceDeclaration(current) || ts.isSourceFile(current)) return owner;
    current = current.parent;
  }
  return owner;
}

function enclosingInstantiationGraphOwner(node) {
  let current = node.parent;
  while (current) {
    if (ts.isDecorator(current)) {
      let decorated = current.parent;
      while (ts.isParameter(decorated)) decorated = decorated.parent;
      if (isGraphDeclaration(decorated)) return decorated;
    }
    if (isGraphDeclaration(current)) return current;
    if (ts.isClassDeclaration(current) || ts.isInterfaceDeclaration(current)) return current;
    current = current.parent;
  }
  return null;
}
function occurrence(project, node, sourceFile) { const item = descriptor(project, node, "occurrence", "reference", sourceFile); return { ...item, key: `${item.filePath}:${item.range.start.line}:${item.range.start.column}` }; }
export function relationKey(item) { return `${item.kind}|${sourceKey(item.source)}|${sourceKey(item.target)}|${item.occurrence.key}`; }
function relation(project, kind, sourceNode, targetNode, occurrenceNode, sourceFile, targetFile, targetKind = declarationKind(targetNode)) {
  const sourceName = sourceNode === sourceFile ? normalized(project, sourceFile.fileName) : graphDeclarationName(sourceNode);
  const targetName = targetNode.name?.getText(targetFile) ?? "<file>";
  const source = descriptor(project, sourceNode, sourceNode === sourceFile ? "file" : declarationKind(sourceNode), sourceName, sourceFile);
  const target = descriptor(project, targetNode, targetKind, targetName, targetFile);
  return { kind, source: { ...source, key: sourceKey(source) }, target: { ...target, key: sourceKey(target) }, occurrence: occurrence(project, occurrenceNode, sourceFile), evidence: { rule: "typescript-compiler-api", stage: "source-derived", resolution: "exact", confidence: 1 } };
}

function resolvedDeclaration(checker, node) {
  const symbol = checker.getSymbolAtLocation(node);
  const resolved = symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol;
  const valueDeclaration = resolved?.valueDeclaration;
  return (valueDeclaration !== undefined && isGraphDeclaration(valueDeclaration)
    ? valueDeclaration
    : resolved?.declarations?.find((candidate) => isGraphDeclaration(candidate))) ?? null;
}
function isProjectSource(project, sourceFile) { const file = normalized(project, sourceFile.fileName); return !sourceFile.isDeclarationFile && !file.startsWith("node_modules/") && !file.startsWith("../"); }
function layer(filePath) { return filePath.split("/").slice(0, 2).join("/"); }
export function isTestSourcePath(filePath) { return /(?:^|\/)(?:test|tests|e2e)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/iu.test(filePath); }
function strata(item) { return { sourceRole: isTestSourcePath(item.source.filePath) ? "test" : "production", layer: layer(item.source.filePath), relationKind: item.kind, crossFile: item.source.filePath !== item.target.filePath, declarationKind: item.source.kind }; }

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function nearestClass(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) return current;
    current = current.parent;
  }
  return null;
}

function visibleIdentifierDeclaration(checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0] ?? null;
}

function importedIdentifierValueDeclaration(checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  if (symbol === undefined || (symbol.flags & ts.SymbolFlags.Alias) === 0) return null;
  const imported = checker.getAliasedSymbol(symbol);
  return imported.valueDeclaration ?? imported.declarations?.[0] ?? null;
}

function hasUniqueNamedGraphMember(owner, name) {
  return (ts.isClassDeclaration(owner) || ts.isInterfaceDeclaration(owner)) &&
    owner.members.filter((member) =>
      isGraphDeclaration(member) && member.name !== undefined && ts.isIdentifier(member.name) && member.name.text === name
    ).length === 1;
}

function readonlyParameterPropertyType(checker, node, propertyName) {
  const owner = nearestClass(node);
  if (owner === null) return null;
  for (const member of owner.members) {
    if (!ts.isConstructorDeclaration(member)) continue;
    for (const parameter of member.parameters) {
      if (!ts.isIdentifier(parameter.name) || parameter.name.text !== propertyName || parameter.type === undefined) continue;
      const isParameterProperty = parameter.modifiers?.some((modifier) =>
        modifier.kind === ts.SyntaxKind.PublicKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
        modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;
      if (!isParameterProperty || !hasModifier(parameter, ts.SyntaxKind.ReadonlyKeyword)) return null;
      return resolvedDeclaration(checker, ts.isTypeReferenceNode(parameter.type) ? parameter.type.typeName : parameter.type);
    }
  }
  return null;
}

/**
 * Compiler resolution is broader than a sound static navigation edge. Keep
 * only invocation shapes whose receiver identity is explicit in source. This
 * intentionally excludes inferred factory results, arbitrary object fields,
 * computed/optional access, and interface dispatch through unproven values.
 */
function isExactEligibleInvocation(checker, node, target) {
  if (!isGraphDeclaration(target)) return false;
  for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isDecorator(current)) return false;
  }
  if (ts.isNewExpression(node)) {
    return node.questionDotToken === undefined && ts.isIdentifier(node.expression) && ts.isClassDeclaration(target);
  }
  if (!ts.isCallExpression(node) || node.questionDotToken !== undefined) return false;
  if (ts.isIdentifier(node.expression)) return true;
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.questionDotToken !== undefined || !ts.isIdentifier(node.expression.name)) return false;
  if (!(ts.isMethodDeclaration(target) || ts.isMethodSignature(target))) return false;

  const receiver = node.expression.expression;
  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    const owner = nearestClass(node);
    return owner !== null && target.parent === owner;
  }
  if (ts.isNewExpression(receiver) && ts.isIdentifier(receiver.expression)) return true;
  if (ts.isIdentifier(receiver)) {
    const declaration = visibleIdentifierDeclaration(checker, receiver);
    if (ts.isImportSpecifier(declaration) || ts.isImportClause(declaration) || ts.isNamespaceImport(declaration)) {
      const imported = importedIdentifierValueDeclaration(checker, receiver);
      return ts.isClassDeclaration(imported) && target.parent === imported &&
        hasUniqueNamedGraphMember(imported, node.expression.name.text);
    }
    if (ts.isParameter(declaration)) {
      return declaration.type !== undefined && (ts.isTypeReferenceNode(declaration.type) || ts.isTypeLiteralNode(declaration.type));
    }
    return ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined &&
      ts.isNewExpression(declaration.initializer) && ts.isIdentifier(declaration.initializer.expression) &&
      (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
  }
  if (ts.isPropertyAccessExpression(receiver) && receiver.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const receiverType = readonlyParameterPropertyType(checker, node, receiver.name.text);
    return receiverType !== null;
  }
  return false;
}

export function collectTypeScriptTruthCandidates({ program, project, sourceFiles = null }) {
  const checker = program.getTypeChecker(); const identities = []; const moduleImportExport = []; const callsInstantiates = []; const signatures = [];
  const allowed = sourceFiles === null ? null : new Set(sourceFiles);
  const files = program.getSourceFiles().filter((file) => isProjectSource(project, file) && (allowed === null || allowed.has(normalized(project, file.fileName))));
  for (const sourceFile of files.sort((a, b) => compare(a.fileName, b.fileName))) {
    const visit = (node) => {
      if (isGraphDeclaration(node)) { const name = graphDeclarationName(node); if (name !== null) { const item = descriptor(project, node, declarationKind(node), name, sourceFile); identities.push({ kind: "identity", target: { ...item, key: sourceKey(item) }, strata: { sourceRole: isTestSourcePath(item.filePath) ? "test" : "production", layer: layer(item.filePath), relationKind: "identity", crossFile: false, declarationKind: item.kind }, evidence: { rule: "typescript-compiler-api", stage: "source-derived", resolution: "exact", confidence: 1 } }); } }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = ts.resolveModuleName(node.moduleSpecifier.text, sourceFile.fileName, program.getCompilerOptions(), ts.sys).resolvedModule?.resolvedFileName;
        if (resolved && isProjectSource(project, program.getSourceFile(resolved) ?? { fileName: resolved, isDeclarationFile: true })) {
          const targetFile = program.getSourceFile(resolved); const source = descriptor(project, sourceFile, "file", normalized(project, sourceFile.fileName), sourceFile); const target = descriptor(project, targetFile, "file", normalized(project, targetFile.fileName), targetFile);
          const item = { kind: ts.isImportDeclaration(node) ? "imports" : "exports", source: { ...source, key: sourceKey(source) }, target: { ...target, key: sourceKey(target) }, occurrence: occurrence(project, node.moduleSpecifier, sourceFile), evidence: { rule: "typescript-compiler-api-module-resolution", stage: "source-derived", resolution: "exact", confidence: 1 } }; item.strata = strata(item); moduleImportExport.push(item);
        }
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expression = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression; const target = resolvedDeclaration(checker, expression);
        const owner = (ts.isNewExpression(node)
          ? enclosingInstantiationGraphOwner(node)
          : enclosingSourceGraphOwner(node)) ?? sourceFile;
        if (target && target.getSourceFile() && isProjectSource(project, target.getSourceFile()) && isExactEligibleInvocation(checker, node, target)) { const item = relation(project, ts.isNewExpression(node) ? "instantiates" : "calls", owner, target, expression, sourceFile, target.getSourceFile()); item.strata = strata(item); callsInstantiates.push(item); }
      }
      if (ts.isHeritageClause(node)) for (const type of node.types) { const target = resolvedDeclaration(checker, type.expression); const owner = node.parent; if (target && isGraphDeclaration(owner) && isProjectSource(project, target.getSourceFile())) { const item = relation(project, node.token === ts.SyntaxKind.ImplementsKeyword ? "implements" : "extends", owner, target, type.expression, sourceFile, target.getSourceFile()); item.strata = strata(item); signatures.push(item); } }
      if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isConstructorDeclaration(node)) && isGraphDeclaration(node)) {
        for (const [kind, type] of [...node.parameters.map((parameter) => ["accepts", parameter.type]), ["returns", node.type]]) if (type) { const target = resolvedDeclaration(checker, type); if (target && isProjectSource(project, target.getSourceFile())) { const item = relation(project, kind, node, target, type, sourceFile, target.getSourceFile()); item.strata = strata(item); signatures.push(item); } }
      }
      ts.forEachChild(node, visit);
    }; visit(sourceFile);
  }
  const dedupe = (items) => [...new Map(items.map((item) => [item.kind === "identity" ? item.target.key : relationKey(item), item])).values()].sort((a, b) => compare(a.kind === "identity" ? a.target.key : relationKey(a), b.kind === "identity" ? b.target.key : relationKey(b)));
  const crossLayerTestImpact = dedupe([...moduleImportExport, ...callsInstantiates, ...signatures].filter((item) => item.strata.crossFile && (item.strata.layer !== layer(item.target.filePath) || item.strata.sourceRole === "test" || isTestSourcePath(item.target.filePath))));
  return { identities: dedupe(identities), moduleImportExport: dedupe(moduleImportExport), callsInstantiates: dedupe(callsInstantiates), acceptsReturnsExtendsImplements: dedupe(signatures), crossLayerTestImpact };
}

export function selectStratified(candidates, count, seed) {
  const groups = new Map();
  for (const candidate of candidates) { const key = Object.values(candidate.strata).join("|"); const group = groups.get(key) ?? []; group.push(candidate); groups.set(key, group); }
  const ordered = [...groups.entries()].sort(([a], [b]) => compare(a, b)).map(([key, group]) => ({
    key,
    group: [...group].sort((a, b) => compare(
      stableSha256(`${seed}|${a.kind === "identity" ? a.target.key : relationKey(a)}`),
      stableSha256(`${seed}|${b.kind === "identity" ? b.target.key : relationKey(b)}`)
    ))
  }));
  const selected = [];
  for (let offset = 0; selected.length < count; offset += 1) { let added = false; for (const { group } of ordered) { if (group[offset]) { selected.push(group[offset]); added = true; if (selected.length === count) break; } } if (!added) break; }
  return selected;
}

function truthKey(item) {
  return item.kind === "identity" ? `identity|${item.target.key}` : relationKey(item);
}

export function selectUniquePositiveGroups(categories, candidates, quotas, seed) {
  const used = new Set();
  const groups = {};
  const availability = {};
  for (const [quota, category] of categories) {
    const eligible = candidates[category].filter((candidate) => !used.has(truthKey(candidate)));
    availability[quota] = eligible.length;
    const selected = selectStratified(eligible, quotas[quota], seed);
    groups[quota] = selected;
    for (const item of selected) used.add(truthKey(item));
  }
  return { groups, availability };
}

export function buildNegatives(positiveGroups, candidates, count, seed) {
  const all = Object.values(candidates).flat().filter((item) => item.kind !== "identity"); const known = new Set(all.map(relationKey)); const targets = [...new Map(all.map((item) => [item.target.key, item.target])).values()]; const negatives = [];
  for (const truth of Object.values(positiveGroups).flat().filter((item) => item.kind !== "identity")) for (const target of targets) { const key = `${truth.kind}|${truth.source.key}|${target.key}|${truth.occurrence.key}`; if (target.key !== truth.target.key && target.kind === truth.target.kind && !known.has(key)) negatives.push({ kind: truth.kind, source: truth.source, forbiddenTarget: target, occurrence: truth.occurrence, strata: truth.strata, rationale: "compiler API found no direct relation" }); }
  return [...new Map(negatives.map((item) => [`${item.kind}|${item.source.key}|${item.forbiddenTarget.key}|${item.occurrence.key}`, item])).values()].sort((a, b) => compare(stableSha256(`${seed}|${a.kind}|${a.source.key}|${a.forbiddenTarget.key}|${a.occurrence.key}`), stableSha256(`${seed}|${b.kind}|${b.source.key}|${b.forbiddenTarget.key}|${b.occurrence.key}`))).slice(0, count);
}

function evidenceOccurrence(value) { if (typeof value?.key === "string") return value.key; if (typeof value?.filePath === "string" && value?.range?.start) return `${value.filePath}:${value.range.start.line}:${value.range.start.column}`; return null; }
function validExactEvidence(edge) { return edge?.resolution === "exact" && edge?.confidence === 1 && typeof edge?.evidence?.rule === "string" && typeof edge?.evidence?.stage === "string"; }
function comparePosition(left, right) { return left.line - right.line || left.column - right.column; }
function validDescriptor(value) { return typeof value?.filePath === "string" && value?.range?.start && typeof value?.kind === "string" && typeof value?.name === "string"; }
export function descriptorMatches(expected, observed) {
  if (!validDescriptor(expected) || !validDescriptor(observed) || expected.filePath !== observed.filePath || expected.kind !== observed.kind) return false;
  if (expected.kind === "file") return true;
  if (expected.name !== observed.name) return false;
  const position = expected.range.start;
  const start = observed.range.start;
  const end = observed.range.end;
  return end === undefined
    ? comparePosition(position, start) === 0
    : comparePosition(start, position) <= 0 && comparePosition(position, end) < 0;
}
export function scoreOracleEvidence(positiveGroups, negatives, evidence) {
  const allEdges = Array.isArray(evidence?.edges) ? evidence.edges : []; const symbols = Array.isArray(evidence?.symbols) ? evidence.symbols : []; const exactEdges = []; let evidenceInvalid = 0;
  for (const edge of allEdges) { const occurrenceKey = evidenceOccurrence(edge.occurrence); if (!validDescriptor(edge.source) || !validDescriptor(edge.target) || !occurrenceKey || !validExactEvidence(edge)) { evidenceInvalid += 1; continue; } exactEdges.push(edge); }
  for (const symbol of symbols) if (!validDescriptor(symbol)) evidenceInvalid += 1;
  const edgeMatches = (truth, target = truth.target) => exactEdges.some((edge) => edge.kind === truth.kind && descriptorMatches(truth.source, edge.source) && descriptorMatches(target, edge.target) && evidenceOccurrence(edge.occurrence) === truth.occurrence.key);
  const positives = Object.values(positiveGroups).flat(); const missing = positives.filter((truth) => truth.kind === "identity" ? !symbols.some((symbol) => descriptorMatches(truth.target, symbol)) : !edgeMatches(truth));
  const falsePositives = negatives.filter((negative) => edgeMatches(negative, negative.forbiddenTarget));
  return { tp: positives.length - missing.length, fp: falsePositives.length, fn: missing.length, evidenceInvalid, unaudited: missing.length, falseNegatives: missing, falsePositives };
}

export async function runOracle(options) {
  const project = resolve(options.project); const manifest = parseOracleManifest(JSON.parse(await readFile(resolve(options.manifest), "utf8"))); const configuration = compilerConfiguration(project, options.tsconfig); const program = ts.createProgram({ rootNames: configuration.fileNames, options: configuration.options });
  const actualCommit = execFileSync("git", ["-c", `safe.directory=${project.split(sep).join("/")}`, "rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim();
  const candidates = collectTypeScriptTruthCandidates({ program, project, sourceFiles: manifest.sourceFiles && new Set(manifest.sourceFiles) }); const seed = options.seed ?? DEFAULT_SEED;
  const quotas = manifest.quotas; const categories = [["identity", "identities"], ["moduleImportExport", "moduleImportExport"], ["callsInstantiates", "callsInstantiates"], ["acceptsReturnsExtendsImplements", "acceptsReturnsExtendsImplements"], ["crossLayerTestImpact", "crossLayerTestImpact"]];
  const selection = selectUniquePositiveGroups(categories, candidates, quotas, seed); const positives = selection.groups; const missingStrata = categories.filter(([quota]) => positives[quota].length < quotas[quota]).map(([quota]) => ({ category: quota, required: quotas[quota], available: selection.availability[quota], selected: positives[quota].length }));
  const negatives = buildNegatives(positives, candidates, quotas.negatives, seed); if (negatives.length < quotas.negatives) missingStrata.push({ category: "negatives", required: quotas.negatives, available: negatives.length, selected: negatives.length });
  const evidence = JSON.parse(await readFile(resolve(options.indexEvidence), "utf8")); const score = scoreOracleEvidence(positives, negatives, evidence);
  const scoringPassed = score.fp === 0 && score.fn === 0 && score.evidenceInvalid === 0 && score.unaudited === 0;
  return { schemaVersion: 1, oracleVersion: ORACLE_VERSION, status: missingStrata.length === 0 && scoringPassed ? "complete" : missingStrata.length > 0 ? "inconclusive" : "failed", source: { project, expectedCommit: manifest.expectedCommit, actualCommit, commitMatches: manifest.expectedCommit === null || actualCommit === manifest.expectedCommit }, seed, quotas, candidateCounts: Object.fromEntries(Object.entries(candidates).map(([key, value]) => [key, value.length])), positiveTruths: positives, negativeAssertions: negatives, missingStrata, score, acceptance: { quotasComplete: missingStrata.length === 0, scoringPassed, falsePositives: score.fp === 0, falseNegatives: score.fn === 0, evidenceInvalid: score.evidenceInvalid === 0, unaudited: score.unaudited === 0 } };
}

export function oracleExitCode(result) {
  return result.status === "complete" && result.source.commitMatches === true &&
    Object.values(result.acceptance).every((value) => value === true) ? 0 : 2;
}

async function main() { const options = parseOracleArguments(process.argv.slice(2)); const result = await runOracle(options); const serialized = `${JSON.stringify(result, null, 2)}\n`; if (options.output) await writeFile(resolve(options.output), serialized, "utf8"); const score = { tp: result.score.tp, fp: result.score.fp, fn: result.score.fn, evidenceInvalid: result.score.evidenceInvalid, unaudited: result.score.unaudited }; process.stdout.write(options.output ? `${JSON.stringify({ output: resolve(options.output), status: result.status, score }, null, 2)}\n` : serialized); process.exitCode = oracleExitCode(result); }
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
