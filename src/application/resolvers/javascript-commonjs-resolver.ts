import { posix } from "node:path";
import type { ArtifactFacts, EdgeEvidence, PendingReference, SymbolNode } from "../../domain/index.js";

/** Precompute syntax-proven CommonJS bindings; package/ESM/default interop stays unresolved. */
export function commonJsBindingResolver(input: {
  factsByFile: ReadonlyMap<string, ArtifactFacts>;
  symbolsById: ReadonlyMap<string, SymbolNode>;
  resolveModule: (filePath: string, specifier: string) => string | undefined;
}): {
  resolveCall: (reference: PendingReference) => { target: SymbolNode | null; evidence: EdgeEvidence } | null;
  resolvePropertyReference: (reference: PendingReference) => { target: SymbolNode; evidence: EdgeEvidence } | null;
} {
  const fileFor = (file: string, specifier: string, suppressionOnly = false): string | undefined => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
    const base = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (base.startsWith("../") || posix.isAbsolute(base)) return undefined;
    const target = input.resolveModule(file, specifier) ?? (suppressionOnly ?
      (/\.(js|cjs)$/u.test(base) ? base : `${base}.js`) : undefined);
    if (!target || !input.factsByFile.get(target)?.commonJsFacts) return undefined;
    // Only exact .js/.cjs files and unambiguous extensionless -> .js lookups.
    // Directory package mains and other extensions need separate runtime rules.
    return (/\.(js|cjs)$/u.test(base) && target === base) ||
      (posix.extname(base) === "" && target === `${base}.js`) ? target : undefined;
  };
  const unsafe = new Set<string>();
  const propertyUnsafe = new Set<string>();
  const dependencies = new Map<string, string[]>();
  for (const [file, facts] of input.factsByFile) {
    if (!facts.commonJsFacts) continue;
    for (const specifier of facts.commonJsFacts.unsafeModules) {
      const target = fileFor(file, specifier, true);
      if (target) unsafe.add(target);
    }
    for (const specifier of facts.commonJsFacts.propertyUnsafeModules ?? facts.commonJsFacts.unsafeModules) {
      const target = fileFor(file, specifier, true);
      if (target) propertyUnsafe.add(target);
    }
    for (const call of facts.commonJsFacts.receiverCalls) {
      const target = fileFor(file, call.moduleSpecifier, true);
      const exported = target === undefined ? [] : input.factsByFile.get(target)?.commonJsFacts?.exports
        .filter((entry) => entry.exportedName === call.exportedName) ?? [];
      if (target && (exported.length !== 1 || exported[0]?.receiverIndependent !== true)) unsafe.add(target);
    }
    dependencies.set(file, facts.commonJsFacts.requires.flatMap((specifier) => {
      const target = fileFor(file, specifier, true);
      return target ? [target] : [];
    }));
  }
  const cycleBlock = (importer: string, target: string): "cycle" | "dependency-limit" | null => {
    const pending = [target];
    const seen = new Set<string>();
    while (pending.length) {
      const file = pending.pop()!;
      if (file === importer) return "cycle";
      if (seen.has(file)) continue;
      if (seen.size >= 256) return "dependency-limit";
      seen.add(file);
      pending.push(...(dependencies.get(file) ?? []));
    }
    return null;
  };
  const calls = new Map<string, NonNullable<ArtifactFacts["commonJsFacts"]>["calls"][number]>();
  const propertyUses = new Map<string, NonNullable<NonNullable<ArtifactFacts["commonJsFacts"]>["propertyUses"]>[number]>();
  const key = (file: string, range: PendingReference["range"]): string =>
    `${file}:${range.start.line}:${range.start.column}:${range.end.line}:${range.end.column}`;
  for (const [file, facts] of input.factsByFile) for (const call of facts.commonJsFacts?.calls ?? []) calls.set(key(file, call.range), call);
  for (const [file, facts] of input.factsByFile) for (const use of facts.commonJsFacts?.propertyUses ?? []) propertyUses.set(key(file, use.range), use);
  const resolveCall = (reference: PendingReference): { target: SymbolNode | null; evidence: EdgeEvidence } | null => {
    if (reference.relationKind !== "calls") return null;
    const binding = calls.get(key(reference.filePath, reference.range));
    if (!binding || binding.localName !== reference.referenceName) return null;
    const file = fileFor(reference.filePath, binding.moduleSpecifier);
    const blocked = file === undefined ? "unresolved-module" : unsafe.has(file) ? "module-object-unsafe" : cycleBlock(reference.filePath, file);
    const exported = blocked !== null || file === undefined ? [] :
      input.factsByFile.get(file)?.commonJsFacts?.exports.filter((item) => item.exportedName === binding.importedName) ?? [];
    const entry = exported.length === 1 ? exported[0] : undefined;
    const target = entry && file ? input.symbolsById.get(entry.symbolId) : undefined;
    if (!target || target.filePath !== file || !entry) return { target: null,
      evidence: { ruleId: `module.commonjs-object-call.${blocked ?? "unproven-export"}`, stage: "unresolved", candidateSymbolIds: [] } };
    return { target, evidence: { ruleId: "module.commonjs-object-call", stage: "module", candidateSymbolIds: [target.id],
      resolutionPath: [reference.filePath, target.filePath],
      commonJsBinding: { policy: "javascript-commonjs-object-call-v1", moduleSpecifier: binding.moduleSpecifier,
        importedName: binding.importedName, localName: binding.localName,
        importSite: { filePath: reference.filePath, range: binding.importRange },
        exportSite: { filePath: target.filePath, range: entry.range } } } };
  };
  const resolvePropertyReference = (reference: PendingReference): { target: SymbolNode; evidence: EdgeEvidence } | null => {
    if (reference.relationKind !== "instantiates") return null;
    const binding = propertyUses.get(key(reference.filePath, reference.range));
    if (!binding || binding.localName !== reference.referenceName) return null;
    const file = fileFor(reference.filePath, binding.moduleSpecifier);
    if (file === undefined || propertyUnsafe.has(file) || cycleBlock(reference.filePath, file) !== null) return null;
    const exported = input.factsByFile.get(file)?.commonJsFacts?.propertyExports?.filter((item) =>
      item.exportedName === binding.importedName) ?? [];
    const entry = exported.length === 1 ? exported[0] : undefined;
    const target = entry === undefined ? undefined : input.symbolsById.get(entry.symbolId);
    if (!entry || !target || target.filePath !== file) return null;
    return { target, evidence: { ruleId: "module.commonjs-object-property-reference", stage: "module",
      candidateSymbolIds: [target.id], resolutionPath: [reference.filePath, file],
      commonJsBinding: { policy: "javascript-commonjs-object-property-reference-v1",
        moduleSpecifier: binding.moduleSpecifier, importedName: binding.importedName,
        localName: binding.localName,
        importSite: { filePath: reference.filePath, range: binding.importRange },
        exportSite: { filePath: file, range: entry.range } } } };
  };
  return { resolveCall, resolvePropertyReference };
}
