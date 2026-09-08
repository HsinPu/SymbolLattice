import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function jspTemplateReferenceRuleId(
  kind: "include-directive" | "include-action" | "forward-action" | "tag-file",
  suffix: "exact-target" | "unresolved-target"
): string {
  return `syntax.jsp.${kind}.literal-project-file.${suffix}`;
}

/** Resolves only exact indexed paths retained by the bounded JSP syntax pass. */
export function projectJspTemplateReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.jspFacts?.templateReferences ?? [])].sort((left, right) => {
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      const byColumn = left.range.start.column - right.range.start.column;
      return byColumn !== 0 ? byColumn : compareStableText(left.sourceId, right.sourceId);
    });
    for (const reference of references) {
      const candidatesById = new Map<string, SymbolNode>();
      for (const targetFilePath of reference.targetFilePaths) {
        const candidate = input.fileSymbols.get(targetFilePath);
        if (candidate !== undefined) {
          candidatesById.set(candidate.id, candidate);
        }
      }
      const candidates = [...candidatesById.values()].sort((left, right) =>
        compareStableText(left.id, right.id)
      );
      const target = candidates.length === 1 ? candidates[0] : undefined;
      const targetId = target?.id ?? null;
      edges.push({
        id: createEdgeId({
          sourceId: reference.sourceId,
          targetId,
          kind: "references",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId: reference.sourceId,
        targetId,
        kind: "references",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "exact",
        confidence: target === undefined ? 0 : 1,
        referenceName: reference.referenceName,
        evidence: referenceEvidence(
          jspTemplateReferenceRuleId(
            reference.kind,
            target === undefined ? "unresolved-target" : "exact-target"
          ),
          "module",
          candidateSymbolIds(candidates)
        )
      });
    }
  }
  return edges;
}
