import { compareStableText, createEdgeId, createSymbolId, type GraphEdge, type SourceRange, type SymbolNode } from "../../domain/index.js";
import { type ExtractedFileFacts } from "../../extraction/index.js";
import { type SourceDocument } from "../../ports/source-catalog.js";
import type { EdgeEvidence } from "../../domain/index.js";

type ReferenceEvidenceFactory = (ruleId: EdgeEvidence["ruleId"], stage: EdgeEvidence["stage"], candidateIds: readonly string[], configurationPaths?: readonly string[], resolutionPath?: readonly string[]) => EdgeEvidence;

interface AdaSourceSlice {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface AdaRuntimePackageUnitFact {
  readonly role: "spec" | "body";
  readonly normalizedFullName: string;
  readonly symbolId: string;
  readonly filePath: string;
  readonly unitRange: SourceRange;
  readonly headerRange: SourceRange;
  readonly nameRange: SourceRange;
  readonly endRange: SourceRange;
}

interface AdaRuntimeProcedureFact {
  readonly symbolId: string;
  readonly filePath: string;
  readonly normalizedFullName: string;
  readonly parameterCount: number;
  readonly projectEligible: boolean;
  readonly range: SourceRange;
}

interface AdaRuntimeCallFact {
  readonly sourceId: string;
  readonly filePath: string;
  readonly referenceName: string;
  readonly argumentCount: number;
  readonly range: SourceRange;
}

const ADA_RESERVED_IDENTIFIERS = new Set([
  "abort", "abs", "abstract", "accept", "access", "aliased", "all", "and", "array", "at",
  "begin", "body", "case", "constant", "declare", "delay", "delta", "digits", "do", "else",
  "elsif", "end", "entry", "exception", "exit", "for", "function", "generic", "goto", "if", "in",
  "interface", "is", "limited", "loop", "mod", "new", "not", "null", "of", "or", "others", "out",
  "overriding", "package", "parallel", "pragma", "private", "procedure", "protected", "raise", "range",
  "record", "rem", "renames", "requeue", "return", "reverse", "select", "separate", "some", "subtype",
  "synchronized", "tagged", "task", "terminate", "then", "type", "until", "use", "when", "while",
  "with", "xor"
]);

function adaRuntimeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adaRuntimeSourceRange(value: unknown): value is SourceRange {
  if (!adaRuntimeRecord(value) || !adaRuntimeRecord(value.start) || !adaRuntimeRecord(value.end)) {
    return false;
  }
  return Number.isSafeInteger(value.start.line) &&
    (value.start.line as number) > 0 &&
    Number.isSafeInteger(value.start.column) &&
    (value.start.column as number) > 0 &&
    Number.isSafeInteger(value.end.line) &&
    (value.end.line as number) > 0 &&
    Number.isSafeInteger(value.end.column) &&
    (value.end.column as number) > 0;
}

function adaRuntimePackageUnitFact(value: unknown): value is AdaRuntimePackageUnitFact {
  return adaRuntimeRecord(value) &&
    (value.role === "spec" || value.role === "body") &&
    typeof value.normalizedFullName === "string" &&
    typeof value.symbolId === "string" &&
    typeof value.filePath === "string" &&
    adaRuntimeSourceRange(value.unitRange) &&
    adaRuntimeSourceRange(value.headerRange) &&
    adaRuntimeSourceRange(value.nameRange) &&
    adaRuntimeSourceRange(value.endRange);
}

function adaRuntimeProcedureFact(value: unknown): value is AdaRuntimeProcedureFact {
  return adaRuntimeRecord(value) &&
    typeof value.symbolId === "string" &&
    typeof value.filePath === "string" &&
    typeof value.normalizedFullName === "string" &&
    typeof value.projectEligible === "boolean" &&
    Number.isSafeInteger(value.parameterCount) &&
    (value.parameterCount as number) >= 0 &&
    adaRuntimeSourceRange(value.range);
}

function adaRuntimeCallFact(value: unknown): value is AdaRuntimeCallFact {
  return adaRuntimeRecord(value) &&
    typeof value.sourceId === "string" &&
    typeof value.filePath === "string" &&
    typeof value.referenceName === "string" &&
    Number.isSafeInteger(value.argumentCount) &&
    (value.argumentCount as number) >= 0 &&
    adaRuntimeSourceRange(value.range);
}

function legalNormalizedAdaIdentifier(value: string): boolean {
  return /^[a-z](?:[a-z0-9]|_[a-z0-9])*$/u.test(value) && !ADA_RESERVED_IDENTIFIERS.has(value);
}

function adaSourceSlice(sourceText: string, range: SourceRange): AdaSourceSlice | null {
  const lineStarts = [0];
  const lineEnds: number[] = [];
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText.charCodeAt(index);
    if (character === 13) {
      lineEnds.push(index);
      if (sourceText.charCodeAt(index + 1) === 10) {
        index += 1;
      }
      lineStarts.push(index + 1);
    } else if (character === 10) {
      lineEnds.push(index);
      lineStarts.push(index + 1);
    }
  }
  lineEnds.push(sourceText.length);
  const offsetFor = (line: number, column: number): number | null => {
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) {
      return null;
    }
    const lineStart = lineStarts[line - 1];
    const lineEnd = lineEnds[line - 1];
    if (lineStart === undefined || lineEnd === undefined || column > lineEnd - lineStart + 1) {
      return null;
    }
    return lineStart + column - 1;
  };
  const start = offsetFor(range.start.line, range.start.column);
  const end = offsetFor(range.end.line, range.end.column);
  return start === null || end === null || end <= start
    ? null
    : { text: sourceText.slice(start, end), start, end };
}

export function projectAdaProjectFacts(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
}, referenceEvidence: ReferenceEvidenceFactory, sameSourceRange: (left: SourceRange, right: SourceRange) => boolean): readonly GraphEdge[] {
  type ValidatedUnit = {
    readonly role: "spec" | "body";
    readonly normalizedFullName: string;
    readonly filePath: string;
    readonly symbol: SymbolNode;
    readonly nameRange: SourceRange;
  };
  const validatedUnits: ValidatedUnit[] = [];
  const seenFactSymbolIds = new Set<string>();
  const runtimeUnitsByFile = new Map<string, readonly AdaRuntimePackageUnitFact[] | undefined>();

  for (const [filePath, facts] of input.factsByFile) {
    const runtimeProjectFacts: unknown = facts.adaProjectFacts;
    if (runtimeProjectFacts === undefined) {
      runtimeUnitsByFile.set(filePath, undefined);
      continue;
    }
    if (
      !adaRuntimeRecord(runtimeProjectFacts) ||
      !Array.isArray(runtimeProjectFacts.packageUnits) ||
      !runtimeProjectFacts.packageUnits.every(adaRuntimePackageUnitFact)
    ) {
      return [];
    }
    runtimeUnitsByFile.set(filePath, runtimeProjectFacts.packageUnits);
  }

  for (const [filePath, facts] of [...input.factsByFile.entries()].sort(([left], [right]) =>
    compareStableText(left, right)
  )) {
    const document = input.sourceDocumentsByPath.get(filePath);
    const eligibleSymbols = facts.symbols.filter((symbol) =>
      symbol.kind === "module" &&
      symbol.filePath === filePath &&
      (symbol.qualifiedName === `${filePath}#package:${symbol.name}` ||
        symbol.qualifiedName === `${filePath}#package-body:${symbol.name}`)
    );
    const packageUnits = runtimeUnitsByFile.get(filePath);
    if (packageUnits === undefined) {
      if (eligibleSymbols.length > 0) {
        return [];
      }
      continue;
    }
    if (document?.language !== "ada") {
      return [];
    }

    for (const fact of packageUnits) {
      const symbol = input.symbolsById.get(fact.symbolId);
      const expectedQualifiedName = fact.role === "spec"
        ? `${filePath}#package:${symbol?.name ?? ""}`
        : `${filePath}#package-body:${symbol?.name ?? ""}`;
      const expectedExtension = fact.role === "spec" ? ".ads" : ".adb";
      const separator = filePath.lastIndexOf("/");
      const fileName = separator === -1 ? filePath : filePath.slice(separator + 1);
      const unitSlice = adaSourceSlice(document.sourceText, fact.unitRange);
      const headerSlice = adaSourceSlice(document.sourceText, fact.headerRange);
      const nameSlice = adaSourceSlice(document.sourceText, fact.nameRange);
      const endSlice = adaSourceSlice(document.sourceText, fact.endRange);
      const expectedHeader = fact.role === "spec"
        ? /^package\s+([A-Za-z][A-Za-z0-9_]*)\s+is$/iu
        : /^package\s+body\s+([A-Za-z][A-Za-z0-9_]*)\s+is$/iu;
      const headerMatch = headerSlice?.text.match(expectedHeader) ?? null;
      const headerName = headerMatch?.[1] ?? "";
      const headerNameOffset = headerSlice?.text.indexOf(headerName) ?? -1;
      const escapedEndName = fact.normalizedFullName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const unitEndMatch = unitSlice?.text.match(
        new RegExp(`end\\s+(${escapedEndName})\\s*;\\s*$`, "iu")
      ) ?? null;
      const unitEndName = unitEndMatch?.[1] ?? "";
      const unitEndOffset = unitEndMatch === null || unitSlice === null
        ? -1
        : unitSlice.text.lastIndexOf(unitEndName);
      if (
        symbol === undefined ||
        seenFactSymbolIds.has(fact.symbolId) ||
        fact.filePath !== filePath ||
        symbol.kind !== "module" ||
        typeof symbol.id !== "string" ||
        typeof symbol.name !== "string" ||
        typeof symbol.qualifiedName !== "string" ||
        typeof symbol.filePath !== "string" ||
        symbol.filePath !== filePath ||
        symbol.qualifiedName !== expectedQualifiedName ||
        symbol.declarationOrdinal !== 0 ||
        symbol.id !== createSymbolId({
          filePath,
          qualifiedName: expectedQualifiedName,
          kind: "module",
          declarationOrdinal: 0
        }) ||
        !adaRuntimeSourceRange(symbol.range) ||
        !sameSourceRange(symbol.range, fact.unitRange) ||
        fact.normalizedFullName !== fact.normalizedFullName.toLowerCase() ||
        !legalNormalizedAdaIdentifier(fact.normalizedFullName) ||
        symbol.name.toLowerCase() !== fact.normalizedFullName ||
        fileName !== `${fact.normalizedFullName}${expectedExtension}` ||
        unitSlice === null ||
        headerSlice === null ||
        nameSlice === null ||
        endSlice === null ||
        headerMatch === null ||
        (headerMatch[1] ?? "").toLowerCase() !== fact.normalizedFullName ||
        nameSlice.text.toLowerCase() !== fact.normalizedFullName ||
        endSlice.text.toLowerCase() !== fact.normalizedFullName ||
        headerNameOffset < 0 ||
        nameSlice.start !== headerSlice.start + headerNameOffset ||
        nameSlice.end !== nameSlice.start + headerName.length ||
        unitEndOffset < 0 ||
        endSlice.start !== unitSlice.start + unitEndOffset ||
        endSlice.end !== endSlice.start + unitEndName.length ||
        headerSlice.start < unitSlice.start ||
        headerSlice.end > unitSlice.end ||
        nameSlice.start < headerSlice.start ||
        nameSlice.end > headerSlice.end ||
        endSlice.start < headerSlice.end ||
        endSlice.end > unitSlice.end
      ) {
        return [];
      }
      seenFactSymbolIds.add(fact.symbolId);
      validatedUnits.push({
        role: fact.role,
        normalizedFullName: fact.normalizedFullName,
        filePath,
        symbol,
        nameRange: fact.nameRange
      });
    }

    if (
      eligibleSymbols.length !== packageUnits.length ||
      eligibleSymbols.some((symbol) => !seenFactSymbolIds.has(symbol.id))
    ) {
      return [];
    }
  }

  const edges: GraphEdge[] = [];
  const names = [...new Set(validatedUnits.map((unit) => unit.normalizedFullName))].sort(compareStableText);
  for (const normalizedFullName of names) {
    const matching = validatedUnits.filter((unit) => unit.normalizedFullName === normalizedFullName);
    const specifications = matching.filter((unit) => unit.role === "spec");
    const bodies = matching.filter((unit) => unit.role === "body");
    if (specifications.length !== 1 || bodies.length !== 1) {
      continue;
    }
    const specification = specifications[0]!;
    const body = bodies[0]!;
    const directory = (filePath: string): string => {
      const separator = filePath.lastIndexOf("/");
      return separator === -1 ? "" : filePath.slice(0, separator);
    };
    if (body.filePath === specification.filePath || directory(body.filePath) !== directory(specification.filePath)) {
      continue;
    }
    edges.push({
      id: createEdgeId({
        sourceId: body.symbol.id,
        targetId: specification.symbol.id,
        kind: "references",
        line: body.nameRange.start.line,
        column: body.nameRange.start.column,
        referenceName: body.symbol.name
      }),
      sourceId: body.symbol.id,
      targetId: specification.symbol.id,
      kind: "references",
      filePath: body.filePath,
      range: body.nameRange,
      resolution: "exact",
      confidence: 1,
      referenceName: body.symbol.name,
      evidence: referenceEvidence(
        "project.ada.root-library-package-body.unique-specification",
        "module",
        [specification.symbol.id],
        [],
        [body.filePath, specification.filePath]
      )
    });
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}

export function projectAdaCallReferences(input: {
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
  readonly existingEdges: readonly GraphEdge[];
  readonly sourceDocumentsByPath: ReadonlyMap<string, SourceDocument>;
}, referenceEvidence: ReferenceEvidenceFactory): readonly GraphEdge[] {
  const procedures = [...input.factsByFile.values()].flatMap((facts) => {
    const projectFacts = facts.adaProjectFacts;
    if (!adaRuntimeRecord(projectFacts) || projectFacts.procedures === undefined) {
      return [];
    }
    return Array.isArray(projectFacts.procedures) && projectFacts.procedures.every(adaRuntimeProcedureFact)
      ? projectFacts.procedures
      : [];
  });
  const calls = [...input.factsByFile.values()].flatMap((facts) => {
    const projectFacts = facts.adaProjectFacts;
    if (!adaRuntimeRecord(projectFacts) || projectFacts.calls === undefined) {
      return [];
    }
    return Array.isArray(projectFacts.calls) && projectFacts.calls.every(adaRuntimeCallFact)
      ? projectFacts.calls
      : [];
  });
  const edges: GraphEdge[] = [];
  for (const call of calls) {
    const source = input.symbolsById.get(call.sourceId);
    const document = input.sourceDocumentsByPath.get(call.filePath);
    if (
      source?.kind !== "function" ||
      source.filePath !== call.filePath ||
      document?.language !== "ada" ||
      !/^[A-Za-z](?:[A-Za-z0-9]|_[A-Za-z0-9])*$/u.test(call.referenceName) ||
      !Number.isSafeInteger(call.argumentCount) ||
      call.argumentCount < 0 ||
      !adaRuntimeSourceRange(call.range)
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
    const candidates = procedures.filter((procedure) =>
      procedure.projectEligible &&
      procedure.normalizedFullName === call.referenceName.toLowerCase() &&
      procedure.parameterCount === call.argumentCount
    );
    const targetFact = candidates.length === 1 ? candidates[0] : undefined;
    const target = targetFact === undefined ? undefined : input.symbolsById.get(targetFact.symbolId);
    if (
      targetFact === undefined ||
      target === undefined ||
      target.kind !== "function" ||
      target.filePath !== targetFact.filePath ||
      targetFact.normalizedFullName !== targetFact.normalizedFullName.toLowerCase() ||
      !Number.isSafeInteger(targetFact.parameterCount) ||
      targetFact.parameterCount < 0 ||
      !adaRuntimeSourceRange(targetFact.range)
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
      evidence: {
        ...referenceEvidence(
          "project.ada.unique-procedure.fixed-arity-call",
          "module",
          [target.id]
        ),
        callArity: {
          actualArgumentCount: call.argumentCount,
          candidates: [{
            symbolId: target.id,
            minimumArgumentCount: call.argumentCount,
            maximumArgumentCount: call.argumentCount,
            applicable: true
          }]
        }
      }
    });
  }
  return edges.sort((left, right) => compareStableText(left.id, right.id));
}
