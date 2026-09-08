import { createEdgeId, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

export function projectFortranCallReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
}): readonly GraphEdge[] {
  const procedures = [...input.factsByFile.values()].flatMap((facts) => facts.fortranFacts?.procedures ?? []);
  const calls = [...input.factsByFile.values()].flatMap((facts) => facts.fortranFacts?.calls ?? []);
  const edges: GraphEdge[] = [];
  for (const call of calls) {
    if (input.existingEdges.some((edge) =>
      edge.kind === "calls" && edge.sourceId === call.sourceId && edge.filePath === call.filePath &&
      edge.range.start.line === call.range.start.line && edge.range.start.column === call.range.start.column
    )) continue;
    const candidates = procedures.filter((procedure) =>
      procedure.projectEligible && procedure.kind === "subroutine" &&
      procedure.name.toLowerCase() === call.referenceName.toLowerCase() &&
      procedure.parameterCount === call.argumentCount
    );
    const targetFact = candidates.length === 1 ? candidates[0] : undefined;
    const target = targetFact === undefined ? undefined : input.symbolsById.get(targetFact.symbolId);
    if (target === undefined) continue;
    edges.push({
      id: createEdgeId({
        sourceId: call.sourceId,
        targetId: target.id,
        kind: "calls",
        line: call.range.start.line,
        column: call.range.start.column,
        referenceName: call.referenceName
      }),
      sourceId: call.sourceId,
      targetId: target.id,
      kind: "calls",
      filePath: call.filePath,
      range: call.range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.referenceName,
      evidence: {
        ruleId: "project.fortran.unique-subroutine.fixed-arity-call",
        stage: "module",
        candidateSymbolIds: [target.id]
      }
    });
  }
  return edges;
}
