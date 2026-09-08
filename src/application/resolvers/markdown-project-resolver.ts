import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function markdownLinkRuleId(
  sourceKind: "inline" | "reference",
  suffix: "exact-target" | "unresolved-target"
): string {
  return `syntax.markdown.${sourceKind}-link.literal-project-file.${suffix}`;
}

/** Resolves only one exact indexed project-relative path retained by the Markdown syntax pass. */
export function projectMarkdownFileReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const links = [...(facts.markdownFacts?.links ?? [])].sort((left, right) => {
      const byLine = left.range.start.line - right.range.start.line;
      if (byLine !== 0) return byLine;
      const byColumn = left.range.start.column - right.range.start.column;
      return byColumn !== 0 ? byColumn : compareStableText(left.sourceId, right.sourceId);
    });
    for (const link of links) {
      const candidate = input.fileSymbols.get(link.targetFilePath);
      const candidates = candidate === undefined ? [] : [candidate];
      const targetId = candidate?.id ?? null;
      edges.push({
        id: createEdgeId({
          sourceId: link.sourceId,
          targetId,
          kind: "references",
          line: link.range.start.line,
          column: link.range.start.column,
          referenceName: link.referenceName
        }),
        sourceId: link.sourceId,
        targetId,
        kind: "references",
        filePath: link.filePath,
        range: link.range,
        resolution: candidate === undefined ? "unresolved" : "exact",
        confidence: candidate === undefined ? 0 : 1,
        referenceName: link.referenceName,
        evidence: referenceEvidence(
          markdownLinkRuleId(
            link.sourceKind === "reference" ? "reference" : "inline",
            candidate === undefined ? "unresolved-target" : "exact-target"
          ),
          "module",
          candidateSymbolIds(candidates)
        )
      });
    }
  }
  return edges;
}
