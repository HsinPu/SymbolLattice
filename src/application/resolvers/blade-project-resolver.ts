import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

function bladeTemplateReferenceRuleId(
  kind: "extends" | "include" | "component" | "each",
  suffix: "exact-target" | "unresolved-target" | "unproven-project-root"
): string {
  return "framework.laravel-blade." + kind + ".literal-resources-views." + suffix;
}

/**
 * A conventional Blade root is exact only in a fixture-shaped project whose
 * entire indexed source surface is Blade files under `resources/views/`. Any PHP,
 * config/provider source, alternative view root, or other source file may
 * customize Laravel's finder, so it leaves literal references unresolved.
 */
function hasProvenConventionalBladeFixtureRoot(
  factsByFile: ReadonlyMap<string, ExtractedFileFacts>
): boolean {
  const filePaths = [...factsByFile.keys()];
  return (
    filePaths.length > 0 &&
    filePaths.every(
      (filePath) =>
        filePath.startsWith("resources/views/") && filePath.endsWith(".blade.php")
    )
  );
}

export function projectBladeTemplateReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly fileSymbols: ReadonlyMap<string, SymbolNode>;
}, referenceEvidence: ReferenceEvidenceFactory, candidateSymbolIds: (...candidateSets: readonly (readonly SymbolNode[])[]) => readonly string[]): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  const hasProvenRoot = hasProvenConventionalBladeFixtureRoot(input.factsByFile);
  for (const [, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const references = [...(facts.bladeFacts?.templateReferences ?? [])].sort((left, right) => {
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
      const target = hasProvenRoot ? input.fileSymbols.get(reference.targetFilePath) : undefined;
      const targetId = target?.id ?? null;
      const ruleSuffix =
        target === undefined
          ? hasProvenRoot
            ? "unresolved-target"
            : "unproven-project-root"
          : "exact-target";
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
          bladeTemplateReferenceRuleId(reference.kind, ruleSuffix),
          "module",
          candidateSymbolIds(target === undefined ? [] : [target])
        )
      });
    }
  }
  return edges;
}
