import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function twigTemplateReferenceRuleId(
  kind: "extends" | "include" | "embed" | "import" | "from",
  suffix: "exact-target" | "unresolved-target"
): string {
  return "framework.twig." + kind + ".literal-templates-root." + suffix;
}

/**
 * Twig logical template names are only projected through the conventional
 * project-local `templates/` root. This intentionally excludes namespace,
 * loader, bundle, and runtime-configured template resolution.
 */
export function projectTwigTemplateReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.twigFacts?.templateReferences ?? [])].sort((left, right) => {
      const bySource = compareStableText(left.sourceId, right.sourceId);
      if (bySource !== 0) {
        return bySource;
      }
      const byRange = left.range.start.line - right.range.start.line;
      if (byRange !== 0) {
        return byRange;
      }
      return left.range.start.column - right.range.start.column;
    });
    for (const reference of references) {
      const target = input.fileSymbols.get(reference.targetFilePath);
      const targetId = target?.id ?? null;
      edges.push({
        id: createEdgeId({
          sourceId: reference.sourceId,
          targetId,
          kind: "calls",
          line: reference.range.start.line,
          column: reference.range.start.column,
          referenceName: reference.referenceName
        }),
        sourceId: reference.sourceId,
        targetId,
        kind: "calls",
        filePath: reference.filePath,
        range: reference.range,
        resolution: target === undefined ? "unresolved" : "exact",
        confidence: target === undefined ? 0 : 1,
        referenceName: reference.referenceName,
        evidence: referenceEvidence(
          twigTemplateReferenceRuleId(
            reference.kind,
            target === undefined ? "unresolved-target" : "exact-target"
          ),
          "module",
          candidateSymbolIds(target === undefined ? [] : [target])
        )
      });
    }
  }
  return edges;
}
