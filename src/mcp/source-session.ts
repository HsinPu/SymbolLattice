import {
  SOURCE_DELIVERY_IDENTITY_POLICY,
  canonicalSourceDeliveryText,
  sourceDeliveryIdentityFromText,
  sourceDeliveryOffsetMap,
  type SourceDeliveryIdentity,
  type SourceDeliveryOffsetMap
} from "../application/source-delivery.js";
import {
  MCP_SOURCE_POINTER_MAXIMUM_CANDIDATE_SYMBOLS,
  MCP_SOURCE_POINTER_MAXIMUM_SYMBOLS,
  MCP_SOURCE_POINTER_POLICY,
  mcpSourcePointerContext,
  projectMcpSourcePointer,
  type McpSourcePointer,
  type McpSourcePointerContext,
  type McpSourcePointerSymbol,
  type McpSourceRange
} from "./source-pointer.js";

export const MCP_SOURCE_SESSION_POLICY = "mcp-session-source-dedup-v6" as const;
export const MCP_SOURCE_SESSION_MODES = ["deduplicate", "full"] as const;
export type McpSourceSessionMode = (typeof MCP_SOURCE_SESSION_MODES)[number];
export type McpSourceTool = "node" | "investigate" | "file" | "explore" | "context";

export const MCP_SOURCE_SESSION_LIMITS = {
  maximumProjects: 4,
  maximumSourcesPerProject: 256,
  minimumAvoidedCharacters: 160,
  minimumEmittedCharacters: 160,
  maximumFragmentsPerSource: 4
} as const;

export interface McpSourceSessionOptions {
  readonly maximumProjects?: number;
  readonly maximumSourcesPerProject?: number;
  readonly minimumAvoidedCharacters?: number;
  readonly minimumEmittedCharacters?: number;
  readonly maximumFragmentsPerSource?: number;
}

interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export interface SourceSessionResponse {
  readonly [key: string]: unknown;
  readonly content: readonly TextContent[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

interface DeliveredSource {
  readonly identity: SourceDeliveryIdentity;
  readonly text: string;
  readonly pointer: McpSourcePointer | null;
  readonly firstDeliveredCallIndex: number;
  readonly firstDeliveredTool: McpSourceTool;
}

interface ProjectSessionState {
  generationId: string;
  callCount: number;
  readonly sources: Map<string, DeliveredSource>;
}

interface Candidate {
  readonly identity: SourceDeliveryIdentity;
  readonly text: string;
  readonly tool: McpSourceTool;
  readonly pointerContext: McpSourcePointerContext | null;
  readonly pointer: McpSourcePointer | null;
}

interface Delivery {
  readonly projection: "full" | "reference" | "partial";
  readonly metadata: Record<string, unknown>;
  readonly emittedSources: number;
  readonly partiallyReferencedSources: number;
  readonly referencedSources: number;
  readonly emittedCharacters: number;
  readonly avoidedCharacters: number;
  readonly stateTruncated: boolean;
}

interface CharacterRange {
  readonly start: number;
  readonly end: number;
}

interface ProvenCoverage extends CharacterRange {
  readonly delivered: DeliveredSource;
}

interface MappedSlice {
  readonly text: string;
  readonly offsetMap: SourceDeliveryOffsetMap;
  readonly deliveredCharacterOffsets: CharacterRange;
}

function boundedPositive(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function boundedNonNegative(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value! : fallback;
}

function mergeRanges(ranges: readonly CharacterRange[]): CharacterRange[] {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: CharacterRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous === undefined || range.start > previous.end) {
      merged.push({ start: range.start, end: range.end });
      continue;
    }
    merged[merged.length - 1] = {
      start: previous.start,
      end: Math.max(previous.end, range.end)
    };
  }
  return merged;
}

function subtractRanges(range: CharacterRange, covered: readonly CharacterRange[]): CharacterRange[] {
  const uncovered: CharacterRange[] = [];
  let cursor = range.start;
  for (const item of covered) {
    if (item.start > cursor) uncovered.push({ start: cursor, end: item.start });
    cursor = Math.max(cursor, item.end);
  }
  if (cursor < range.end) uncovered.push({ start: cursor, end: range.end });
  return uncovered;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourcePosition(value: unknown): { readonly line: number; readonly column: number } | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.line) || (value.line as number) <= 0 ||
    !Number.isSafeInteger(value.column) || (value.column as number) <= 0) return null;
  return { line: value.line as number, column: value.column as number };
}

function sourceRange(value: unknown): McpSourceRange | null {
  if (!isRecord(value)) return null;
  const start = sourcePosition(value.start);
  const end = sourcePosition(value.end);
  if (start === null || end === null || end.line < start.line ||
    (end.line === start.line && end.column < start.column)) return null;
  return { start, end };
}

function pointerSymbol(value: unknown, expectedFilePath: string): McpSourcePointerSymbol | null {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length === 0 ||
    typeof value.kind !== "string" || value.kind.length === 0 ||
    (typeof value.filePath === "string" && value.filePath !== expectedFilePath)) return null;
  const range = sourceRange(value.range);
  if (range === null) return null;
  const reference = typeof value.qualifiedName === "string" && value.qualifiedName.length > 0
    ? value.qualifiedName
    : typeof value.reference === "string" && value.reference.length > 0
      ? value.reference
      : typeof value.id === "string" && value.id.length > 0 ? value.id : null;
  return reference === null ? null : {
    reference,
    name: value.name,
    kind: value.kind,
    range
  };
}

function pointerSymbols(value: unknown, expectedFilePath: string): {
  readonly symbols: readonly McpSourcePointerSymbol[];
  readonly truncated: boolean;
} {
  if (!Array.isArray(value)) return { symbols: [], truncated: false };
  const symbols: McpSourcePointerSymbol[] = [];
  let truncated = value.length > MCP_SOURCE_POINTER_MAXIMUM_CANDIDATE_SYMBOLS;
  for (const raw of value.slice(0, MCP_SOURCE_POINTER_MAXIMUM_CANDIDATE_SYMBOLS)) {
    const symbol = pointerSymbol(raw, expectedFilePath);
    if (symbol === null) {
      truncated = true;
      continue;
    }
    symbols.push(symbol);
  }
  return { symbols, truncated };
}

function referencePointerSymbol(reference: unknown, range: McpSourceRange): McpSourcePointerSymbol | null {
  if (typeof reference !== "string" || reference.length === 0) return null;
  const hash = reference.lastIndexOf("#");
  const name = (hash >= 0 ? reference.slice(hash + 1) : reference).trim();
  if (name.length === 0) return null;
  return { reference, name, kind: "declaration", range };
}

function sourceIdentity(
  value: unknown,
  text: string,
  expectedFilePath: string
): SourceDeliveryIdentity | null {
  if (!isRecord(value) || value.policy !== SOURCE_DELIVERY_IDENTITY_POLICY ||
    typeof value.id !== "string" || !/^source:[0-9a-f]{64}$/u.test(value.id) ||
    value.canonicalization !== "line-endings-lf" || value.filePath !== expectedFilePath ||
    typeof value.contentSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.contentSha256) ||
    !isRecord(value.fullFileCharacterOffsets) ||
    !isRecord(value.offsetMap) ||
    !Number.isSafeInteger(value.fullFileCharacterOffsets.start) ||
    !Number.isSafeInteger(value.fullFileCharacterOffsets.end)) {
    return null;
  }
  try {
    const expected = sourceDeliveryIdentityFromText({
      filePath: value.filePath,
      text,
      fullFileCharacterOffsets: {
        start: value.fullFileCharacterOffsets.start as number,
        end: value.fullFileCharacterOffsets.end as number
      },
      offsetMap: value.offsetMap as unknown as SourceDeliveryOffsetMap
    });
    return expected.id === value.id && expected.contentSha256 === value.contentSha256
      ? expected
      : null;
  } catch {
    return null;
  }
}

function deliveredOffsetForSourceBoundary(
  identity: SourceDeliveryIdentity,
  sourceOffset: number
): number | null {
  for (const span of identity.offsetMap.spans) {
    const source = span.fullFileCharacterOffsets;
    const delivered = span.deliveredCharacterOffsets;
    if (sourceOffset < source.start || sourceOffset > source.end) continue;
    if (sourceOffset === source.start) return delivered.start;
    if (sourceOffset === source.end) return delivered.end;
    if (span.kind === "identity") {
      return delivered.start + sourceOffset - source.start;
    }
    return null;
  }
  if (
    identity.offsetMap.spans.length === 0 &&
    sourceOffset === identity.fullFileCharacterOffsets.start
  ) {
    return 0;
  }
  return null;
}

function mappedSlice(
  source: Pick<Candidate, "identity" | "text">,
  range: CharacterRange
): MappedSlice | null {
  const sourceRange = source.identity.fullFileCharacterOffsets;
  if (range.start < sourceRange.start || range.end > sourceRange.end || range.end < range.start) {
    return null;
  }
  const deliveredStart = deliveredOffsetForSourceBoundary(source.identity, range.start);
  const deliveredEnd = deliveredOffsetForSourceBoundary(source.identity, range.end);
  if (deliveredStart === null || deliveredEnd === null || deliveredEnd < deliveredStart) return null;
  const text = source.text.slice(deliveredStart, deliveredEnd);
  const spans = source.identity.offsetMap.spans.flatMap((span) => {
    const sourceStart = Math.max(range.start, span.fullFileCharacterOffsets.start);
    const sourceEnd = Math.min(range.end, span.fullFileCharacterOffsets.end);
    if (sourceEnd <= sourceStart) return [];
    const spanDeliveredStart = deliveredOffsetForSourceBoundary(source.identity, sourceStart);
    const spanDeliveredEnd = deliveredOffsetForSourceBoundary(source.identity, sourceEnd);
    if (spanDeliveredStart === null || spanDeliveredEnd === null) return [null];
    return [{
      kind: span.kind,
      deliveredCharacterOffsets: {
        start: spanDeliveredStart - deliveredStart,
        end: spanDeliveredEnd - deliveredStart
      },
      fullFileCharacterOffsets: { start: sourceStart, end: sourceEnd }
    }];
  });
  if (spans.some((span) => span === null)) return null;
  try {
    return {
      text,
      deliveredCharacterOffsets: { start: deliveredStart, end: deliveredEnd },
      offsetMap: sourceDeliveryOffsetMap({
        text,
        fullFileCharacterOffsets: range,
        spans: spans as NonNullable<(typeof spans)[number]>[]
      })
    };
  } catch {
    return null;
  }
}

function candidateWithPointer(input: {
  readonly identity: SourceDeliveryIdentity;
  readonly text: string;
  readonly tool: McpSourceTool;
  readonly pointerContext: McpSourcePointerContext | null;
}): Candidate {
  const pointer = input.pointerContext === null ? null : projectMcpSourcePointer({
    context: input.pointerContext,
    sourceId: input.identity.id,
    deliveredCharacterOffsets: { start: 0, end: input.text.length },
    fullFileCharacterOffsets: input.identity.fullFileCharacterOffsets
  });
  return { ...input, pointer };
}

function pointerForSlice(
  candidate: Candidate,
  slice: MappedSlice,
  sourceId: string,
  range: CharacterRange
): McpSourcePointer | null {
  return candidate.pointerContext === null ? null : projectMcpSourcePointer({
    context: candidate.pointerContext,
    sourceId,
    deliveredCharacterOffsets: slice.deliveredCharacterOffsets,
    fullFileCharacterOffsets: range
  });
}

function responseHeader(response: SourceSessionResponse): {
  readonly structured: Record<string, unknown>;
  readonly projectPath: string;
  readonly generationId: string;
} | null {
  if (response.isError === true || !isRecord(response.structuredContent) ||
    !isRecord(response.structuredContent.status) ||
    typeof response.structuredContent.status.projectPath !== "string" ||
    typeof response.structuredContent.status.generationId !== "string" ||
    response.structuredContent.status.projectPath.length === 0 ||
    response.structuredContent.status.generationId.length === 0) {
    return null;
  }
  return {
    structured: response.structuredContent,
    projectPath: response.structuredContent.status.projectPath,
    generationId: response.structuredContent.status.generationId
  };
}

/** Session-local, post-worker exact-source coverage shared by node, investigate, and file. */
export class McpSourceSession {
  private readonly maximumProjects: number;
  private readonly maximumSourcesPerProject: number;
  private readonly minimumAvoidedCharacters: number;
  private readonly minimumEmittedCharacters: number;
  private readonly maximumFragmentsPerSource: number;
  private readonly projects = new Map<string, ProjectSessionState>();

  public constructor(options: McpSourceSessionOptions = {}) {
    this.maximumProjects = boundedPositive(options.maximumProjects, MCP_SOURCE_SESSION_LIMITS.maximumProjects);
    this.maximumSourcesPerProject = boundedPositive(
      options.maximumSourcesPerProject,
      MCP_SOURCE_SESSION_LIMITS.maximumSourcesPerProject
    );
    this.minimumAvoidedCharacters = boundedNonNegative(
      options.minimumAvoidedCharacters,
      MCP_SOURCE_SESSION_LIMITS.minimumAvoidedCharacters
    );
    this.minimumEmittedCharacters = boundedNonNegative(
      options.minimumEmittedCharacters,
      MCP_SOURCE_SESSION_LIMITS.minimumEmittedCharacters
    );
    this.maximumFragmentsPerSource = boundedPositive(
      options.maximumFragmentsPerSource,
      MCP_SOURCE_SESSION_LIMITS.maximumFragmentsPerSource
    );
  }

  public project<TResponse extends SourceSessionResponse>(
    response: TResponse,
    tool: McpSourceTool,
    mode: McpSourceSessionMode
  ): TResponse {
    if (!MCP_SOURCE_SESSION_MODES.includes(mode)) return response;
    const header = responseHeader(response);
    if (header === null) return response;
    const candidates = this.candidates(header.structured, tool);
    if (candidates === null || candidates.length === 0) return response;

    const selected = this.projectState(header.projectPath, header.generationId);
    selected.state.callCount += 1;
    const callIndex = selected.state.callCount;
    let emittedSources = 0;
    let partiallyReferencedSources = 0;
    let referencedSources = 0;
    let emittedCharacters = 0;
    let avoidedCharacters = 0;
    let stateTruncated = selected.projectEvicted;
    const deliveries = candidates.map((candidate): Delivery =>
      this.deliveryForCandidate(selected.state, candidate, tool, mode, callIndex)
    );
    for (const delivery of deliveries) {
      emittedSources += delivery.emittedSources;
      partiallyReferencedSources += delivery.partiallyReferencedSources;
      referencedSources += delivery.referencedSources;
      emittedCharacters += delivery.emittedCharacters;
      avoidedCharacters += delivery.avoidedCharacters;
      stateTruncated ||= delivery.stateTruncated;
    }

    const projected = this.applyDeliveries(header.structured, tool, deliveries);
    if (projected === null) return response;
    const structuredContent = {
      ...projected,
      sessionSource: {
        policy: MCP_SOURCE_SESSION_POLICY,
        scope: "mcp-server-session",
        identityPolicy: SOURCE_DELIVERY_IDENTITY_POLICY,
        pointerPolicy: MCP_SOURCE_POINTER_POLICY,
        equality: "verified-offset-map-and-canonical-content",
        mode,
        tool,
        projectPath: header.projectPath,
        generationId: header.generationId,
        callIndex,
        generationReset: selected.generationReset,
        bounds: {
          maximumProjects: this.maximumProjects,
          maximumSourcesPerProject: this.maximumSourcesPerProject,
          minimumAvoidedCharacters: this.minimumAvoidedCharacters,
          minimumEmittedCharacters: this.minimumEmittedCharacters,
          maximumFragmentsPerSource: this.maximumFragmentsPerSource,
          maximumPointerSymbols: MCP_SOURCE_POINTER_MAXIMUM_SYMBOLS
        },
        summary: {
          candidateSources: candidates.length,
          emittedSources,
          partiallyReferencedSources,
          referencedSources,
          emittedCharacters,
          avoidedCharacters,
          stateSourcesAfterCall: selected.state.sources.size,
          stateTruncated
        }
      }
    };
    return {
      ...response,
      content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent
    };
  }

  private deliveryForCandidate(
    state: ProjectSessionState,
    candidate: Candidate,
    tool: McpSourceTool,
    mode: McpSourceSessionMode,
    callIndex: number
  ): Delivery {
    const prior = state.sources.get(candidate.identity.id);
    if (
      mode === "deduplicate" &&
      prior !== undefined &&
      prior.identity.contentSha256 === candidate.identity.contentSha256
    ) {
      return this.referenceDelivery(candidate, [prior], [{
        start: candidate.identity.fullFileCharacterOffsets.start,
        end: candidate.identity.fullFileCharacterOffsets.end
      }]);
    }

    if (mode === "full") {
      return this.fullDelivery(state, candidate, tool, callIndex, "mode-full", []);
    }

    const candidateRange = candidate.identity.fullFileCharacterOffsets;
    const proof = this.provenCoverage(state, candidate);
    const proven = proof.coverage;
    const covered = mergeRanges(proven);
    if (covered.length === 0) {
      return this.fullDelivery(
        state,
        candidate,
        tool,
        callIndex,
        proof.offsetMapUnavailable ? "offset-map-unavailable" : "no-proven-overlap",
        []
      );
    }
    const coveredSlices = covered.map((range) => mappedSlice(candidate, range));
    if (coveredSlices.some((slice) => slice === null)) {
      return this.fullDelivery(state, candidate, tool, callIndex, "offset-map-unavailable", covered);
    }
    const coveredCharacters = coveredSlices.reduce(
      (total, slice) => total + slice!.text.length,
      0
    );
    if (
      covered.length === 1 &&
      covered[0]!.start === candidateRange.start &&
      covered[0]!.end === candidateRange.end
    ) {
      return this.referenceDelivery(candidate, proven.map((item) => item.delivered), covered);
    }

    const uncovered = subtractRanges(candidateRange, covered);
    const uncoveredSlices = uncovered.map((range) => mappedSlice(candidate, range));
    if (uncoveredSlices.some((slice) => slice === null)) {
      return this.fullDelivery(state, candidate, tool, callIndex, "offset-map-unavailable", covered);
    }
    const emittedCharacters = uncoveredSlices.reduce(
      (total, slice) => total + slice!.text.length,
      0
    );
    if (coveredCharacters < this.minimumAvoidedCharacters) {
      return this.fullDelivery(
        state,
        candidate,
        tool,
        callIndex,
        "below-minimum-savings",
        covered
      );
    }
    if (emittedCharacters < this.minimumEmittedCharacters) {
      return this.fullDelivery(
        state,
        candidate,
        tool,
        callIndex,
        "insufficient-new-context",
        covered
      );
    }
    if (uncovered.length > this.maximumFragmentsPerSource) {
      return this.fullDelivery(
        state,
        candidate,
        tool,
        callIndex,
        "too-many-fragments",
        covered
      );
    }

    let stateTruncated = false;
    const fragments = uncovered.map((range, index) => {
      const slice = uncoveredSlices[index]!;
      if (slice === null) {
        throw new Error("Verified uncovered source slice disappeared before projection.");
      }
      const text = slice.text;
      const identity = sourceDeliveryIdentityFromText({
        filePath: candidate.identity.filePath,
        text,
        fullFileCharacterOffsets: range,
        offsetMap: slice.offsetMap
      });
      const pointer = pointerForSlice(candidate, slice, identity.id, range);
      stateTruncated ||= this.remember(state, {
        identity,
        text,
        tool,
        pointerContext: null,
        pointer
      }, callIndex);
      return {
        text,
        sourceIdentity: identity,
        ...(pointer === null ? {} : { pointer })
      };
    });
    const coveredBy = this.coveredBy(proven.map((item) => item.delivered));
    const coveredPointers = covered.flatMap((range, index) => {
      const slice = coveredSlices[index]!;
      if (slice === null) return [];
      const pointer = pointerForSlice(candidate, slice, candidate.identity.id, range);
      return pointer === null ? [] : [pointer];
    });
    return {
      projection: "partial",
      metadata: {
        policy: MCP_SOURCE_SESSION_POLICY,
        status: "partially-served",
        sourceId: candidate.identity.id,
        callIndex,
        tool,
        coveredCharacterOffsets: covered,
        ...(coveredPointers.length === 0 ? {} : { coveredPointers }),
        coveredBy,
        fragments,
        intervalDecision: {
          status: "partial",
          reason: "proven-overlap",
          avoidedCharacters: coveredCharacters,
          emittedCharacters
        },
        message: `Reused ${coveredCharacters} exact UTF-16 characters already delivered in this project generation and emitted ${emittedCharacters} new characters in ${fragments.length} bounded fragment(s).`
      },
      emittedSources: 0,
      partiallyReferencedSources: 1,
      referencedSources: 0,
      emittedCharacters,
      avoidedCharacters: coveredCharacters,
      stateTruncated
    };
  }

  private provenCoverage(
    state: ProjectSessionState,
    candidate: Candidate
  ): { readonly coverage: ProvenCoverage[]; readonly offsetMapUnavailable: boolean } {
    const candidateRange = candidate.identity.fullFileCharacterOffsets;
    const coverage: ProvenCoverage[] = [];
    let offsetMapUnavailable = false;
    for (const delivered of state.sources.values()) {
      if (delivered.identity.filePath !== candidate.identity.filePath) continue;
      const deliveredRange = delivered.identity.fullFileCharacterOffsets;
      const start = Math.max(candidateRange.start, deliveredRange.start);
      const end = Math.min(candidateRange.end, deliveredRange.end);
      if (end <= start) continue;
      const candidateOverlap = mappedSlice(candidate, { start, end });
      const deliveredOverlap = mappedSlice(delivered, { start, end });
      if (candidateOverlap === null || deliveredOverlap === null) {
        offsetMapUnavailable = true;
        continue;
      }
      if (
        canonicalSourceDeliveryText(candidateOverlap.text) !==
        canonicalSourceDeliveryText(deliveredOverlap.text)
      ) continue;
      coverage.push({ start, end, delivered });
    }
    return { coverage, offsetMapUnavailable };
  }

  private referenceDelivery(
    candidate: Candidate,
    delivered: readonly DeliveredSource[],
    covered: readonly CharacterRange[]
  ): Delivery {
    const coveredBy = this.coveredBy(delivered);
    const first = coveredBy[0]!;
    const coveredPointers = covered.flatMap((range) => {
      const slice = mappedSlice(candidate, range);
      if (slice === null) return [];
      const pointer = pointerForSlice(candidate, slice, candidate.identity.id, range);
      return pointer === null ? [] : [pointer];
    });
    return {
      projection: "reference",
      metadata: {
        policy: MCP_SOURCE_SESSION_POLICY,
        status: "already-served",
        sourceId: candidate.identity.id,
        firstDeliveredCallIndex: first.firstDeliveredCallIndex,
        firstDeliveredTool: first.firstDeliveredTool,
        coveredCharacterOffsets: covered,
        ...(coveredPointers.length === 0 ? {} : { coveredPointers }),
        coveredBy,
        message: `Exact source ${candidate.identity.id} is fully covered by source delivered earlier in this project generation.`
      },
      emittedSources: 0,
      partiallyReferencedSources: 0,
      referencedSources: 1,
      emittedCharacters: 0,
      avoidedCharacters: candidate.text.length,
      stateTruncated: false
    };
  }

  private fullDelivery(
    state: ProjectSessionState,
    candidate: Candidate,
    tool: McpSourceTool,
    callIndex: number,
    reason: "mode-full" | "offset-map-unavailable" | "no-proven-overlap" |
      "below-minimum-savings" | "insufficient-new-context" | "too-many-fragments",
    covered: readonly CharacterRange[]
  ): Delivery {
    const stateTruncated = this.remember(state, candidate, callIndex);
    return {
      projection: "full",
      metadata: {
        policy: MCP_SOURCE_SESSION_POLICY,
        status: "emitted",
        sourceId: candidate.identity.id,
        callIndex,
        tool,
        ...(candidate.pointer === null ? {} : { pointer: candidate.pointer }),
        intervalDecision: {
          status: "full",
          reason,
          provenCoveredCharacterOffsets: covered
        }
      },
      emittedSources: 1,
      partiallyReferencedSources: 0,
      referencedSources: 0,
      emittedCharacters: candidate.text.length,
      avoidedCharacters: 0,
      stateTruncated
    };
  }

  private coveredBy(delivered: readonly DeliveredSource[]): Array<{
    readonly sourceId: string;
    readonly firstDeliveredCallIndex: number;
    readonly firstDeliveredTool: McpSourceTool;
    readonly pointer?: McpSourcePointer;
  }> {
    const unique = new Map<string, DeliveredSource>();
    for (const source of delivered) unique.set(source.identity.id, source);
    return [...unique.values()]
      .sort((left, right) =>
        left.firstDeliveredCallIndex - right.firstDeliveredCallIndex ||
        left.identity.id.localeCompare(right.identity.id)
      )
      .map((source) => ({
        sourceId: source.identity.id,
        firstDeliveredCallIndex: source.firstDeliveredCallIndex,
        firstDeliveredTool: source.firstDeliveredTool,
        ...(source.pointer === null ? {} : { pointer: source.pointer })
      }));
  }

  private remember(
    state: ProjectSessionState,
    candidate: Candidate,
    callIndex: number
  ): boolean {
    if (!state.sources.has(candidate.identity.id)) {
      state.sources.set(candidate.identity.id, {
        identity: candidate.identity,
        text: candidate.text,
        pointer: candidate.pointer,
        firstDeliveredCallIndex: callIndex,
        firstDeliveredTool: candidate.tool
      });
    }
    let truncated = false;
    while (state.sources.size > this.maximumSourcesPerProject) {
      const oldest = state.sources.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      state.sources.delete(oldest);
      truncated = true;
    }
    return truncated;
  }

  private candidates(structured: Record<string, unknown>, tool: McpSourceTool): Candidate[] | null {
    if (tool === "explore" && structured.mode === "query" && Array.isArray(structured.focuses)) {
      return this.contextCandidates(structured.focuses, tool);
    }
    if (tool === "node" || tool === "explore") {
      if (!isRecord(structured.source) || typeof structured.source.text !== "string" ||
        typeof structured.source.filePath !== "string") return null;
      const identity = sourceIdentity(
        structured.source.sourceIdentity,
        structured.source.text,
        structured.source.filePath
      );
      if (identity === null) return null;
      const range = sourceRange(structured.source.range);
      const matchSymbol = isRecord(structured.match) && structured.match.status === "exact"
        ? pointerSymbol(structured.match.symbol, identity.filePath)
        : null;
      const pointerContext = range === null ? null : mcpSourcePointerContext({
        filePath: identity.filePath,
        text: structured.source.text,
        start: range.start,
        expectedEnd: range.end,
        allowTruncatedEnd: structured.source.truncated === true,
        symbols: matchSymbol === null ? [] : [matchSymbol]
      });
      return [candidateWithPointer({
        identity,
        text: structured.source.text,
        tool,
        pointerContext
      })];
    }
    if (tool === "file") {
      if (structured.contentAvailability !== "active-generation" || !Array.isArray(structured.lines)) return null;
      const lineTexts: string[] = [];
      const lineNumbers: number[] = [];
      let validLineMetadata = true;
      for (const line of structured.lines) {
        if (!isRecord(line) || typeof line.text !== "string") return null;
        lineTexts.push(line.text);
        if (!Number.isSafeInteger(line.line) || (line.line as number) <= 0) {
          validLineMetadata = false;
        } else {
          lineNumbers.push(line.line as number);
        }
      }
      if (lineTexts.length === 0) return null;
      const text = lineTexts.join("\n");
      if (!isRecord(structured.selection) || typeof structured.selection.filePath !== "string") return null;
      const identity = sourceIdentity(structured.sourceIdentity, text, structured.selection.filePath);
      if (identity === null) return null;
      const consecutive = validLineMetadata && lineNumbers.length === lineTexts.length && lineNumbers.every(
        (line, index) => index === 0 || line === lineNumbers[index - 1]! + 1
      );
      const symbolSelection = pointerSymbols(structured.symbols, identity.filePath);
      const pointerContext = !consecutive ? null : mcpSourcePointerContext({
        filePath: identity.filePath,
        text,
        start: { line: lineNumbers[0]!, column: 1 },
        expectedEnd: {
          line: lineNumbers[lineNumbers.length - 1]!,
          column: lineTexts[lineTexts.length - 1]!.length + 1
        },
        symbols: symbolSelection.symbols,
        symbolsTruncated: symbolSelection.truncated
      });
      return [candidateWithPointer({ identity, text, tool, pointerContext })];
    }
    if (tool === "context") {
      return Array.isArray(structured.contexts)
        ? this.contextCandidates(structured.contexts, tool)
        : null;
    }
    if (!Array.isArray(structured.declarations)) return null;
    const candidates: Candidate[] = [];
    const seenSourceIds = new Set<string>();
    for (const declaration of structured.declarations) {
      if (!isRecord(declaration)) return null;
      if (declaration.source === null) continue;
      if (!isRecord(declaration.source) ||
        typeof declaration.source.filePath !== "string" ||
        typeof declaration.source.text !== "string" ||
        !Number.isSafeInteger(declaration.source.primarySegmentIndex) ||
        !Array.isArray(declaration.source.renderedSegments) ||
        (declaration.source.primarySegmentIndex as number) < 0 ||
        (declaration.source.primarySegmentIndex as number) >= declaration.source.renderedSegments.length) return null;
      const declarationCandidates: Candidate[] = [];
      for (const segment of declaration.source.renderedSegments) {
        if (!isRecord(segment) || typeof segment.text !== "string") return null;
        const identity = sourceIdentity(
          segment.sourceIdentity,
          segment.text,
          declaration.source.filePath
        );
        if (identity === null || seenSourceIds.has(identity.id)) return null;
        seenSourceIds.add(identity.id);
        const renderedRange = sourceRange(segment.renderedRange);
        const referenceSymbol = renderedRange === null
          ? null
          : referencePointerSymbol(declaration.reference, renderedRange);
        const pointerContext = renderedRange === null ? null : mcpSourcePointerContext({
          filePath: identity.filePath,
          text: segment.text,
          start: renderedRange.start,
          expectedEnd: renderedRange.end,
          symbols: referenceSymbol === null ? [] : [referenceSymbol]
        });
        declarationCandidates.push(candidateWithPointer({
          identity,
          text: segment.text,
          tool,
          pointerContext
        }));
      }
      const primary = declarationCandidates[declaration.source.primarySegmentIndex as number];
      const primaryIdentity = sourceIdentity(
        declaration.source.sourceIdentity,
        declaration.source.text,
        declaration.source.filePath
      );
      if (primary === undefined || primary.text !== declaration.source.text ||
        primaryIdentity === null || primaryIdentity.id !== primary.identity.id) return null;
      candidates.push(...declarationCandidates);
    }
    return candidates;
  }

  private contextCandidates(contexts: readonly unknown[], tool: "context" | "explore"): Candidate[] | null {
    const contextCandidates: Candidate[] = [];
    for (const context of contexts) {
      if (!isRecord(context)) return null;
      if (context.source === null) continue;
      if (!isRecord(context.source) || typeof context.source.text !== "string" ||
        typeof context.source.filePath !== "string") return null;
      const identity = sourceIdentity(
        context.source.sourceIdentity,
        context.source.text,
        context.source.filePath
      );
      if (identity === null) return null;
      const range = sourceRange(context.source.range);
      const matchSymbol = isRecord(context.match) && context.match.status === "exact"
        ? pointerSymbol(context.match.symbol, identity.filePath)
        : null;
      const pointerContext = range === null ? null : mcpSourcePointerContext({
        filePath: identity.filePath,
        text: context.source.text,
        start: range.start,
        expectedEnd: range.end,
        allowTruncatedEnd: context.source.truncated === true,
        symbols: matchSymbol === null ? [] : [matchSymbol]
      });
      contextCandidates.push(candidateWithPointer({
        identity,
        text: context.source.text,
        tool,
        pointerContext
      }));
    }
    return contextCandidates;
  }

  private applyDeliveries(
    structured: Record<string, unknown>,
    tool: McpSourceTool,
    deliveries: readonly Delivery[]
  ): Record<string, unknown> | null {
    if (tool === "explore" && structured.mode === "query" && Array.isArray(structured.focuses)) {
      const focuses = this.applyContextDeliveries(structured.focuses, deliveries);
      return focuses === null ? null : { ...structured, focuses };
    }
    if (tool === "node" || tool === "explore") {
      if (!isRecord(structured.source) || deliveries.length !== 1) return null;
      return {
        ...structured,
        source: {
          ...structured.source,
          text: deliveries[0]!.projection === "full" ? structured.source.text : null,
          ...(Array.isArray(structured.source.lines)
            ? { lines: deliveries[0]!.projection === "full" ? structured.source.lines : [] }
            : {}),
          delivery: deliveries[0]!.metadata
        }
      };
    }
    if (tool === "file") {
      if (deliveries.length !== 1) return null;
      return {
        ...structured,
        lines: deliveries[0]!.projection === "full" ? structured.lines : [],
        sourceDelivery: deliveries[0]!.metadata
      };
    }
    if (tool === "context") {
      if (!Array.isArray(structured.contexts)) return null;
      const contexts = this.applyContextDeliveries(structured.contexts, deliveries);
      return contexts === null ? null : { ...structured, contexts };
    }
    if (!Array.isArray(structured.declarations)) return null;
    let deliveryIndex = 0;
    const declarations = structured.declarations.map((declaration) => {
      if (!isRecord(declaration) || declaration.source === null || !isRecord(declaration.source) ||
        !Array.isArray(declaration.source.renderedSegments)) return declaration;
      const renderedSegments = declaration.source.renderedSegments.map((segment) => {
        const delivery = deliveries[deliveryIndex++];
        if (!isRecord(segment) || delivery === undefined) return segment;
        if (delivery.projection === "full") return { ...segment, delivery: delivery.metadata };
        const { text: _text, ...metadata } = segment;
        return { ...metadata, delivery: delivery.metadata };
      });
      const primaryIndex = declaration.source.primarySegmentIndex;
      const primary = Number.isSafeInteger(primaryIndex) ? deliveries[deliveryIndex - renderedSegments.length + (primaryIndex as number)] : undefined;
      return {
        ...declaration,
        source: {
          ...declaration.source,
          text: primary?.projection === "full" ? declaration.source.text : null,
          renderedSegments
        }
      };
    });
    return deliveryIndex === deliveries.length ? { ...structured, declarations } : null;
  }

  private applyContextDeliveries(
    contexts: readonly unknown[],
    deliveries: readonly Delivery[]
  ): readonly unknown[] | null {
    let deliveryIndex = 0;
    const projected = contexts.map((context) => {
      if (!isRecord(context) || context.source === null || !isRecord(context.source)) return context;
      const delivery = deliveries[deliveryIndex++];
      if (delivery === undefined) return context;
      return {
        ...context,
        source: {
          ...context.source,
          text: delivery.projection === "full" ? context.source.text : null,
          ...(Array.isArray(context.source.lines)
            ? { lines: delivery.projection === "full" ? context.source.lines : [] }
            : {}),
          delivery: delivery.metadata
        }
      };
    });
    return deliveryIndex === deliveries.length ? projected : null;
  }

  private projectState(projectPath: string, generationId: string): {
    readonly state: ProjectSessionState;
    readonly generationReset: boolean;
    readonly projectEvicted: boolean;
  } {
    let state = this.projects.get(projectPath);
    let generationReset = false;
    let projectEvicted = false;
    if (state !== undefined && state.generationId !== generationId) {
      state = { generationId, callCount: 0, sources: new Map() };
      this.projects.set(projectPath, state);
      generationReset = true;
    }
    if (state === undefined) {
      while (this.projects.size >= this.maximumProjects) {
        const oldest = this.projects.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.projects.delete(oldest);
        projectEvicted = true;
      }
      state = { generationId, callCount: 0, sources: new Map() };
      this.projects.set(projectPath, state);
    }
    return { state, generationReset, projectEvicted };
  }
}
