import {
  compareStableText,
  createEdgeId,
  type EdgeEvidence,
  type ScalaRelationCallFact,
  type ScalaRelationCallableFact,
  type ScalaRelationHeritageFact,
  type ScalaRelationImportFact,
  type ScalaRelationInstantiationFact,
  type ScalaRelationOverrideFact,
  type ScalaRelationTypeFact,
  type GraphEdge,
  type SourceRange,
  type SymbolNode
} from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

type ReferenceEvidenceFactory = (
  ruleId: EdgeEvidence["ruleId"],
  stage: EdgeEvidence["stage"],
  candidateIds: readonly string[],
  configurationPaths?: readonly string[],
  resolutionPath?: readonly string[]
) => EdgeEvidence;

interface ResolvedScalaRelationType {
  readonly fact: ScalaRelationTypeFact;
  readonly symbol: SymbolNode;
}

interface ResolvedScalaRelationCallable {
  readonly fact: ScalaRelationCallableFact;
  readonly symbol: SymbolNode;
}

/** Projects Scala facts through explicit imports and direct owner/member proof without compiler inference. */
export function projectScalaRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const types: ResolvedScalaRelationType[] = [];
  const callables: ResolvedScalaRelationCallable[] = [];
  const imports: ScalaRelationImportFact[] = [];
  const calls: ScalaRelationCallFact[] = [];
  const instantiations: ScalaRelationInstantiationFact[] = [];
  const heritage: ScalaRelationHeritageFact[] = [];
  const overrides: ScalaRelationOverrideFact[] = [];
  const packageByFile = new Map<string, string>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const relationFacts = facts.scalaRelationFacts;
    if (relationFacts === undefined) continue;
    packageByFile.set(filePath, relationFacts.packageName);
    for (const fact of relationFacts.types) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) types.push({ fact, symbol });
    }
    for (const fact of relationFacts.callables) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) callables.push({ fact, symbol });
    }
    imports.push(...relationFacts.imports);
    calls.push(...relationFacts.calls);
    instantiations.push(...relationFacts.instantiations);
    heritage.push(...relationFacts.heritage ?? []);
    overrides.push(...relationFacts.overrides ?? []);
  }
  const typesByPath = new Map<string, ResolvedScalaRelationType[]>();
  const typesByName = new Map<string, ResolvedScalaRelationType[]>();
  const callablesByName = new Map<string, ResolvedScalaRelationCallable[]>();
  for (const entry of types) {
    typesByPath.set(entry.fact.qualifiedTypePath, [...(typesByPath.get(entry.fact.qualifiedTypePath) ?? []), entry]);
    typesByName.set(entry.fact.name, [...(typesByName.get(entry.fact.name) ?? []), entry]);
  }
  for (const entry of callables) callablesByName.set(entry.fact.name, [...(callablesByName.get(entry.fact.name) ?? []), entry]);
  const importsByFile = new Map<string, ScalaRelationImportFact[]>();
  for (const importFact of imports) importsByFile.set(importFact.filePath, [...(importsByFile.get(importFact.filePath) ?? []), importFact]);
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const exactArity = (fact: ScalaRelationCallableFact, count: number): boolean => fact.parameterCount === count && fact.requiredParameterCount === count;
  const importedPathFor = (filePath: string, localName: string, wildcard = false): readonly string[] => (importsByFile.get(filePath) ?? []).filter((fact) => !fact.isWildcard && (wildcard || fact.localName === localName)).map((fact) => fact.importedPath);
  const typeCandidates = (filePath: string, name: string): readonly ResolvedScalaRelationType[] => {
    const direct = typesByPath.get(name) ?? [];
    const imported = importedPathFor(filePath, name).flatMap((path) => typesByPath.get(path) ?? []);
    const packageName = packageByFile.get(filePath) ?? "";
    const samePackage = (typesByName.get(name) ?? []).filter((candidate) => candidate.fact.packageName === packageName);
    return [...new Map([...direct, ...imported, ...samePackage].map((candidate) => [candidate.symbol.id, candidate])).values()];
  };
  const visibleType = (filePath: string, candidate: ResolvedScalaRelationType): boolean => candidate.symbol.filePath === filePath || (candidate.fact.isExported && (candidate.fact.packageName === (packageByFile.get(filePath) ?? "") || importedPathFor(filePath, candidate.fact.name).includes(candidate.fact.qualifiedTypePath)));
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  for (const importFact of imports) {
    if (importFact.isWildcard || importFact.isAliased) continue;
    const source = input.symbolsById.get(importFact.sourceId);
    const candidates = typesByPath.get(importFact.importedPath) ?? [];
    const targetFiles = [...new Set(candidates.filter((candidate) => candidate.symbol.filePath !== importFact.filePath && candidate.fact.isExported).map((candidate) => candidate.symbol.filePath))];
    const target = targetFiles.length === 1 ? input.symbolsById.get([...input.symbolsById.values()].find((symbol) => symbol.kind === "file" && symbol.filePath === targetFiles[0])?.id ?? "") : undefined;
    if (source?.kind === "file" && target !== undefined) push(edgeFor({ sourceId: source.id, targetId: target.id, kind: "imports", filePath: importFact.filePath, referenceName: importFact.importedPath, range: importFact.range, ruleId: "module.scala.explicit-import.unique-target", targetFilePath: target.filePath }));
  }
  for (const callable of callables) {
    for (const typeName of [...new Set(callable.fact.parameterTypeNames ?? [])]) {
      const candidates = typeCandidates(callable.symbol.filePath, typeName).filter((candidate) => candidate.fact.declarationKind !== "object" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "accepts", filePath: callable.symbol.filePath, referenceName: typeName, range: callable.fact.range, ruleId: "syntax.scala.unique-signature-parameter-type", targetFilePath: candidates[0].symbol.filePath }));
    }
    if (callable.fact.returnTypeName !== undefined) {
      const candidates = typeCandidates(callable.symbol.filePath, callable.fact.returnTypeName).filter((candidate) => candidate.fact.declarationKind !== "object" && visibleType(callable.symbol.filePath, candidate));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: callable.symbol.id, targetId: candidates[0].symbol.id, kind: "returns", filePath: callable.symbol.filePath, referenceName: callable.fact.returnTypeName, range: callable.fact.range, ruleId: "syntax.scala.unique-signature-return-type", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  const sourceCallable = (sourceId: string, filePath: string): ResolvedScalaRelationCallable | undefined => callables.find((candidate) => candidate.symbol.id === sourceId && candidate.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceCallable(call.sourceId, call.filePath);
    if (source === undefined) continue;
    if (call.callKind === "direct") {
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind !== "constructor" && exactArity(candidate.fact, call.argumentCount) && (candidate.symbol.filePath === call.filePath && candidate.fact.ownerTypeId === source.fact.ownerTypeId || candidate.symbol.filePath === call.filePath && candidate.fact.ownerTypeId === undefined));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.scala.unique-direct-owner-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.callKind === "module") {
      const objectCandidates = typeCandidates(call.filePath, call.receiverObjectName ?? "").filter((candidate) => candidate.fact.declarationKind === "object" && visibleType(call.filePath, candidate));
      const candidates = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "method" && exactArity(candidate.fact, call.argumentCount) && objectCandidates.some((object) => object.symbol.id === candidate.fact.ownerTypeId));
      if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "module.scala.unique-object-method-call", targetFilePath: candidates[0].symbol.filePath }));
      continue;
    }
    if (call.receiverTypeName === undefined) continue;
    const receiverCandidates = typeCandidates(call.filePath, call.receiverTypeName).filter((candidate) => candidate.fact.declarationKind === "class" || candidate.fact.declarationKind === "caseclass");
    if (receiverCandidates.length !== 1 || receiverCandidates[0] === undefined) continue;
    const members = (callablesByName.get(call.referenceName) ?? []).filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.ownerTypeId === receiverCandidates[0]!.symbol.id && exactArity(candidate.fact, call.argumentCount));
    if (members.length === 1 && members[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: members[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.referenceName, range: call.range, ruleId: "syntax.scala.unique-typed-member-call", targetFilePath: members[0].symbol.filePath }));
  }
  for (const instantiation of instantiations) {
    const source = sourceCallable(instantiation.sourceId, instantiation.filePath);
    if (source === undefined) continue;
    const candidates = typeCandidates(instantiation.filePath, instantiation.typeName).filter((candidate) => (candidate.fact.declarationKind === "class" || candidate.fact.declarationKind === "caseclass") && visibleType(instantiation.filePath, candidate) && candidate.fact.constructorParameterCount === instantiation.argumentCount && candidate.fact.constructorRequiredParameterCount === instantiation.argumentCount);
    if (candidates.length === 1 && candidates[0] !== undefined) push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "instantiates", filePath: instantiation.filePath, referenceName: instantiation.typeName, range: instantiation.range, ruleId: "syntax.scala.unique-constructor-creation", targetFilePath: candidates[0].symbol.filePath }));
  }
  const heritageEdges: GraphEdge[] = [];
  for (const reference of heritage) {
    const source = input.symbolsById.get(reference.sourceId);
    if (source?.filePath !== reference.filePath) continue;
    const sourceFact = types.find((candidate) => candidate.symbol.id === source.id);
    const candidates = typeCandidates(reference.filePath, reference.referenceName).filter((candidate) => candidate.symbol.id !== source.id && visibleType(reference.filePath, candidate));
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const edge = edgeFor({ sourceId: source.id, targetId: candidates[0].symbol.id, kind: reference.relationKind, filePath: reference.filePath, referenceName: reference.referenceName, range: reference.range, ruleId: reference.relationKind === "implements" ? "syntax.scala.unique-trait-target" : "syntax.scala.unique-parent-target", targetFilePath: candidates[0].symbol.filePath });
    heritageEdges.push(edge);
    push(edge);
  }
  for (const override of overrides) {
    const source = input.symbolsById.get(override.sourceId);
    const sourceFact = callables.find((candidate) => candidate.symbol.id === override.sourceId);
    const owner = types.find((candidate) => candidate.symbol.filePath === override.filePath && candidate.fact.name === override.ownerTypeName);
    if (source?.filePath !== override.filePath || sourceFact === undefined || owner === undefined) continue;
    const parents = heritageEdges.filter((edge) => edge.sourceId === owner.symbol.id && edge.kind === "extends");
    const parentMethods = callables.filter((candidate) => candidate.fact.callableKind === "method" && candidate.fact.name === override.methodName && exactArity(candidate.fact, sourceFact.fact.parameterCount) && parents.some((parent) => parent.targetId === candidate.fact.ownerTypeId));
    if (parentMethods.length === 1 && parentMethods[0] !== undefined) push(edgeFor({ sourceId: source.id, targetId: parentMethods[0].symbol.id, kind: "overrides", filePath: override.filePath, referenceName: override.methodName, range: override.range, ruleId: "syntax.scala.explicit-override.direct-parent-method", targetFilePath: parentMethods[0].symbol.filePath }));
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
