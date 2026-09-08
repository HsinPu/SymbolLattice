import { compareStableText, createEdgeId, type GraphEdge, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import { type SourceDocument } from "../../ports/source-catalog.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

/**
 * Resolves Razor Pages only through the one canonical same-path code-behind.
 * The retained Razor facts intentionally never enter generic name resolution:
 * a missing, partial, nested, or overloaded C# shape simply yields no edge.
 */
export function projectRazorPagesReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
  readonly structuralEdges: readonly GraphEdge[];
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [pagePath, pageFacts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const razorFacts = pageFacts.razorFacts;
    if (razorFacts === undefined || razorFacts.model === undefined) {
      continue;
    }
    const pageFile = input.symbolsById.get(razorFacts.fileSymbolId);
    const pageDefault = input.symbolsById.get(razorFacts.defaultSymbolId);
    if (
      pageFile?.kind !== "file" ||
      pageFile.filePath !== pagePath ||
      pageDefault === undefined ||
      pageDefault.filePath !== pagePath ||
      razorFacts.model.sourceId !== pageDefault.id
    ) {
      continue;
    }
    const companionPath = `${pagePath}.cs`;
    const companionFacts = input.factsByFile.get(companionPath);
    const companionDocument = input.sourceDocumentsByPath.get(companionPath);
    if (companionFacts === undefined || companionDocument?.language !== "csharp") {
      continue;
    }
    const companionFile = companionFacts.symbols.find((symbol) => symbol.kind === "file");
    if (companionFile === undefined || companionFile.filePath !== companionPath) {
      continue;
    }
    const directlyContains = (parentId: string, childId: string): boolean =>
      input.structuralEdges.some(
        (edge) => edge.kind === "contains" && edge.sourceId === parentId && edge.targetId === childId
      );
    const directClassFacts = companionFacts.csharpDirectClassFacts ?? [];
    const directClassFact = (classId: string) => {
      const matchingFacts = directClassFacts.filter((candidate) => candidate.classId === classId);
      return matchingFacts.length === 1 && matchingFacts[0]?.isPartial === false
        ? matchingFacts[0]
        : undefined;
    };
    const modelCandidates = companionFacts.symbols.filter(
      (symbol) =>
        symbol.kind === "class" &&
        symbol.name === razorFacts.model?.modelName &&
        symbol.filePath === companionPath &&
        directlyContains(companionFile.id, symbol.id) &&
        directClassFact(symbol.id) !== undefined
    );
    if (modelCandidates.length !== 1 || modelCandidates[0] === undefined) {
      continue;
    }
    const model = modelCandidates[0];
    edges.push({
      id: createEdgeId({
        sourceId: razorFacts.model.sourceId,
        targetId: model.id,
        kind: "references",
        line: razorFacts.model.range.start.line,
        column: razorFacts.model.range.start.column,
        referenceName: razorFacts.model.modelName
      }),
      sourceId: razorFacts.model.sourceId,
      targetId: model.id,
      kind: "references",
      filePath: pagePath,
      range: razorFacts.model.range,
      resolution: "exact",
      confidence: 1,
      referenceName: razorFacts.model.modelName,
      evidence: referenceEvidence(
        "framework.razor-pages.direct-model.conventional-companion",
        "module",
        [model.id],
        [],
        [pagePath, companionPath]
      )
    });
    const modelFact = directClassFact(model.id);
    const hasIndexedPageModelShadow = [...input.symbolsById.values()].some(
      (symbol) => symbol.kind === "class" && symbol.name === "PageModel"
    );
    if (modelFact?.isRazorPageModel !== true || hasIndexedPageModelShadow) {
      continue;
    }
    for (const handler of razorFacts.postHandlers ?? []) {
      if (handler.sourceId !== pageDefault.id) {
        continue;
      }
      const handlerCandidates = (modelFact.razorPageHandlerMethods ?? [])
        .filter((candidate) => candidate.handlerName === handler.handlerName)
        .map((candidate) => input.symbolsById.get(candidate.methodId))
        .filter(
          (candidate): candidate is SymbolNode =>
            candidate?.kind === "method" &&
            candidate.filePath === companionPath &&
            directlyContains(model.id, candidate.id)
        );
      if (handlerCandidates.length !== 1 || handlerCandidates[0] === undefined) {
        continue;
      }
      const target = handlerCandidates[0];
      edges.push({
        id: createEdgeId({
          sourceId: pageDefault.id,
          targetId: target.id,
          kind: "handles",
          line: handler.range.start.line,
          column: handler.range.start.column,
          referenceName: handler.handlerName
        }),
        sourceId: pageDefault.id,
        targetId: target.id,
        kind: "handles",
        filePath: pagePath,
        range: handler.range,
        resolution: "exact",
        confidence: 1,
        referenceName: handler.handlerName,
        evidence: referenceEvidence(
          "framework.razor-pages.literal-post-handler.conventional-companion-method",
          "module",
          [target.id],
          [],
          [pagePath, companionPath]
        )
      });
    }
  }
  return edges;
}
