import { createEdgeId, type GraphEdge, type PascalCallFact, type PascalRoutineFact, type PascalUnitFact, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import { type SourceDocument } from "../../ports/source-catalog.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

export function projectPascalCallReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const units: PascalUnitFact[] = [];
  const routines: PascalRoutineFact[] = [];
  const calls: PascalCallFact[] = [];
  for (const facts of input.factsByFile.values()) {
    const pascalFacts = facts.pascalFacts;
    if (
      pascalFacts === undefined ||
      !Array.isArray(pascalFacts.units) ||
      !Array.isArray(pascalFacts.routines) ||
      !Array.isArray(pascalFacts.calls)
    ) {
      continue;
    }
    units.push(...pascalFacts.units);
    routines.push(...pascalFacts.routines);
    calls.push(...pascalFacts.calls);
  }

  const edges: GraphEdge[] = [];
  for (const call of calls) {
    const source = input.symbolsById.get(call.sourceId);
    const document = input.sourceDocumentsByPath.get(call.filePath);
    const usesUnitNames = call.usesUnitNames.map((name) => name.toLowerCase());
    if (
      source?.kind !== "file" ||
      source.filePath !== call.filePath ||
      document?.language !== "pascal" ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(call.referenceName) ||
      !Number.isSafeInteger(call.argumentCount) ||
      call.argumentCount !== 0 ||
      usesUnitNames.length === 0 ||
      usesUnitNames.some((name) => !/^[a-z_][a-z0-9_]*$/u.test(name)) ||
      new Set(usesUnitNames).size !== usesUnitNames.length ||
      !call.range?.start ||
      !call.range?.end
    ) {
      continue;
    }
    if (input.existingEdges.some((edge) =>
      edge.kind === "calls" &&
      edge.sourceId === call.sourceId &&
      edge.filePath === call.filePath &&
      edge.range.start.line === call.range.start.line &&
      edge.range.start.column === call.range.start.column
    )) {
      continue;
    }

    const callerFacts = input.factsByFile.get(call.filePath)?.pascalFacts;
    if (
      callerFacts === undefined ||
      callerFacts.calls.every((candidate) =>
        candidate.sourceId !== call.sourceId ||
        candidate.range.start.line !== call.range.start.line ||
        candidate.range.start.column !== call.range.start.column
      ) ||
      callerFacts.routines.some((routine) =>
        routine.unitName === null &&
        routine.name.toLowerCase() === call.referenceName.toLowerCase()
      )
    ) {
      continue;
    }

    const importedUnits = units.filter((unit) =>
      unit.kind === "unit" &&
      unit.projectEligible &&
      unit.filePath !== call.filePath &&
      usesUnitNames.includes(unit.name.toLowerCase()) &&
      input.symbolsById.get(unit.symbolId)?.kind === "file" &&
      input.symbolsById.get(unit.symbolId)?.filePath === unit.filePath
    );
    if (importedUnits.length !== usesUnitNames.length) {
      continue;
    }

    const targetCandidates = routines.filter((routine) =>
      routine.projectEligible &&
      routine.unitName !== null &&
      routine.name.toLowerCase() === call.referenceName.toLowerCase() &&
      routine.parameterCount === call.argumentCount &&
      importedUnits.some((unit) =>
        unit.filePath === routine.filePath &&
        unit.name.toLowerCase() === routine.unitName?.toLowerCase()
      )
    );
    const targetFact = targetCandidates.length === 1 ? targetCandidates[0] : undefined;
    const target = targetFact === undefined ? undefined : input.symbolsById.get(targetFact.symbolId);
    const targetDocument = targetFact === undefined
      ? undefined
      : input.sourceDocumentsByPath.get(targetFact.filePath);
    if (
      targetFact === undefined ||
      target === undefined ||
      target.kind !== "function" ||
      target.filePath !== targetFact.filePath ||
      !target.isExported ||
      targetDocument?.language !== "pascal"
    ) {
      continue;
    }

    edges.push({
      id: createEdgeId({
        sourceId: source.id,
        targetId: target.id,
        kind: "calls",
        line: call.range.start.line,
        column: call.range.start.column,
        referenceName: call.referenceName
      }),
      sourceId: source.id,
      targetId: target.id,
      kind: "calls",
      filePath: call.filePath,
      range: call.range,
      resolution: "exact",
      confidence: 1,
      referenceName: call.referenceName,
      evidence: referenceEvidence(
        "project.pascal.unit-uses.unique-exported-zero-argument-call",
        "module",
        [target.id]
      )
    });
  }
  return edges;
}
