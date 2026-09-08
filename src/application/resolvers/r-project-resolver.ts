import { compareStableText, createEdgeId, type GraphEdge, type RCallFact, type RFunctionFact, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface ResolvedRFunction {
  readonly fact: RFunctionFact;
  readonly symbol: SymbolNode;
}

/** Projects only unique same-file R direct calls; package loading and dispatch stay nonclaims. */
export function projectRRelationFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const functions: ResolvedRFunction[] = [];
  const calls: RCallFact[] = [];
  const taintedFiles = new Set<string>();
  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) => compareStableText(left, right))) {
    const rFacts = facts.rFacts;
    if (rFacts === undefined || rFacts.parserRejected === true) continue;
    if (rFacts.bindingTainted === true) taintedFiles.add(filePath);
    for (const fact of rFacts.functions) {
      const symbol = input.symbolsById.get(fact.symbolId);
      if (symbol?.filePath === filePath && symbol.kind === "function" && symbol.name === fact.name) {
        functions.push({ fact, symbol });
      }
    }
    calls.push(...rFacts.calls);
  }
  const functionsByFileAndName = new Map<string, ResolvedRFunction[]>();
  for (const entry of functions) {
    const key = `${entry.symbol.filePath}\u0000${entry.fact.name}`;
    functionsByFileAndName.set(key, [...(functionsByFileAndName.get(key) ?? []), entry]);
  }
  const edgeIds = new Set(input.existingEdges.map((edge) => edge.id));
  const edges: GraphEdge[] = [];
  const push = (edge: GraphEdge): void => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  for (const call of calls) {
    if (taintedFiles.has(call.filePath)) continue;
    const source = input.symbolsById.get(call.sourceId);
    if (source?.kind !== "function" || source.filePath !== call.filePath) continue;
    const sourceFact = functions.find((candidate) => candidate.symbol.id === source.id);
    if (sourceFact?.fact.dynamicDispatch === true) continue;
    const candidates = (functionsByFileAndName.get(`${call.filePath}\u0000${call.referenceName}`) ?? [])
      .filter((candidate) => candidate.fact.dynamicDispatch !== true);
    if (candidates.length !== 1 || candidates[0] === undefined) continue;
    const target = candidates[0];
    push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.symbol.id,
        kind: "calls",
        line: call.range.start.line,
        column: call.range.start.column,
        referenceName: call.referenceName
      }),
      sourceId: source.id,
      targetId: target.symbol.id,
      kind: "calls",
      filePath: call.filePath,
      range: call.range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.referenceName,
      evidence: referenceEvidence(
        "syntax.r.unique-same-file-direct-call",
        "syntax",
        [target.symbol.id]
      )
    });
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
