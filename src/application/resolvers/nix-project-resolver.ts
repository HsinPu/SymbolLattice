import { compareStableText, createEdgeId, type GraphEdge, type NixAttributeFact, type NixCallFact, type NixImportFact, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedNixAttribute {
  readonly fact: NixAttributeFact;
  readonly symbol: SymbolNode;
}

/** Projects Nix literal function applications without evaluating Nix expressions. */
export function projectNixRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly moduleTargetPathByKey: ReadonlyMap<string, string>;
}, referenceEvidence: ReferenceEvidenceFactory, moduleKey: (filePath: string, moduleSpecifier: string) => string): readonly GraphEdge[] {
  const attributes: ResolvedNixAttribute[] = [];
  const imports: NixImportFact[] = [];
  const calls: NixCallFact[] = [];
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const nixFacts = facts.nixFacts;
    if (nixFacts === undefined || nixFacts.parserRejected === true) continue;
    for (const fact of nixFacts.attributes) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.name === fact.name) attributes.push({ fact, symbol });
    }
    imports.push(...nixFacts.imports);
    calls.push(...nixFacts.calls);
  }
  const attributesByFileAndName = new Map<string, ResolvedNixAttribute[]>();
  for (const attribute of attributes) {
    const key = `${attribute.symbol.filePath}\u0000${attribute.fact.name}`;
    attributesByFileAndName.set(key, [...(attributesByFileAndName.get(key) ?? []), attribute]);
  }
  const importsByFileAndBinding = new Map<string, NixImportFact[]>();
  for (const imported of imports) {
    if (imported.bindingName === undefined) continue;
    const key = `${imported.filePath}\u0000${imported.bindingName}`;
    importsByFileAndBinding.set(key, [...(importsByFileAndBinding.get(key) ?? []), imported]);
  }
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => { if (!edgeIds.has(edge.id)) { edgeIds.add(edge.id); edges.push(edge); } };
  const edgeFor = (value: { readonly sourceId: string; readonly targetId: string; readonly kind: GraphEdge["kind"]; readonly filePath: string; readonly referenceName: string; readonly range: SourceRange; readonly ruleId: string; readonly targetFilePath: string }): GraphEdge => {
    const crossFile = value.filePath !== value.targetFilePath;
    return { id: createEdgeId({ sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, line: value.range.start.line, column: value.range.start.column, referenceName: value.referenceName }), sourceId: value.sourceId, targetId: value.targetId, kind: value.kind, filePath: value.filePath, range: value.range, resolution: "exact", confidence: 1, referenceName: value.referenceName, evidence: referenceEvidence(value.ruleId, crossFile ? "module" : "syntax", [value.targetId], [], crossFile ? [value.filePath, value.targetFilePath] : []) };
  };
  const sourceAttribute = (sourceId: string, filePath: string): ResolvedNixAttribute | undefined => attributes.find((attribute) => attribute.symbol.id === sourceId && attribute.symbol.filePath === filePath);
  for (const call of calls) {
    const source = sourceAttribute(call.sourceId, call.filePath);
    if (source === undefined) continue;
    let candidates: ResolvedNixAttribute[] = [];
    if (call.callKind === "direct") {
      candidates = (attributesByFileAndName.get(`${call.filePath}\u0000${call.referenceName}`) ?? []).filter((candidate) => candidate.fact.kind === "function" && candidate.fact.parameterCount === call.argumentCount && candidate.fact.scopeId === source.fact.scopeId);
    } else if (call.receiverName !== undefined) {
      const bindings = importsByFileAndBinding.get(`${call.filePath}\u0000${call.receiverName}`) ?? [];
      if (bindings.length === 1) {
        const imported = bindings[0]!;
        const targetPath = input.moduleTargetPathByKey.get(moduleKey(imported.filePath, imported.importedPath));
        if (targetPath !== undefined) {
          candidates = (attributesByFileAndName.get(`${targetPath}\u0000${call.referenceName}`) ?? []).filter((candidate) => candidate.fact.kind === "function" && candidate.fact.isExported && candidate.fact.parameterCount === call.argumentCount);
        }
      }
    }
    if (candidates.length === 1 && candidates[0] !== undefined) {
      push(edgeFor({ sourceId: source.symbol.id, targetId: candidates[0].symbol.id, kind: "calls", filePath: call.filePath, referenceName: call.callKind === "attribute" && call.receiverName !== undefined ? `${call.receiverName}.${call.referenceName}` : call.referenceName, range: call.range, ruleId: call.callKind === "attribute" ? "module.nix.literal-imported-attribute-call" : "syntax.nix.unique-local-function-call", targetFilePath: candidates[0].symbol.filePath }));
    }
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
