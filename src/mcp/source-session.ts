import {
  SOURCE_DELIVERY_IDENTITY_POLICY,
  sourceDeliveryIdentityFromText,
  type SourceDeliveryIdentity
} from "../application/source-delivery.js";

export const MCP_SOURCE_SESSION_POLICY = "mcp-session-source-dedup-v3" as const;
export const MCP_SOURCE_SESSION_MODES = ["deduplicate", "full"] as const;
export type McpSourceSessionMode = (typeof MCP_SOURCE_SESSION_MODES)[number];
export type McpSourceTool = "node" | "investigate" | "file";

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

function boundedPositive(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function boundedNonNegative(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value! : fallback;
}

function rangeLength(range: CharacterRange): number {
  return range.end - range.start;
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
      }
    });
    return expected.id === value.id && expected.contentSha256 === value.contentSha256
      ? expected
      : null;
  } catch {
    return null;
  }
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
        equality: "exact-overlapping-file-offsets-and-content",
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
          maximumFragmentsPerSource: this.maximumFragmentsPerSource
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
    if (rangeLength(candidateRange) !== candidate.text.length) {
      return this.fullDelivery(
        state,
        candidate,
        tool,
        callIndex,
        "offset-map-unavailable",
        []
      );
    }

    const proven = this.provenCoverage(state, candidate);
    const covered = mergeRanges(proven);
    if (covered.length === 0) {
      return this.fullDelivery(state, candidate, tool, callIndex, "no-proven-overlap", []);
    }
    const coveredCharacters = covered.reduce((total, range) => total + rangeLength(range), 0);
    if (coveredCharacters === candidate.text.length) {
      return this.referenceDelivery(candidate, proven.map((item) => item.delivered), covered);
    }

    const uncovered = subtractRanges(candidateRange, covered);
    const emittedCharacters = uncovered.reduce((total, range) => total + rangeLength(range), 0);
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
    const fragments = uncovered.map((range) => {
      const text = candidate.text.slice(range.start - candidateRange.start, range.end - candidateRange.start);
      const identity = sourceDeliveryIdentityFromText({
        filePath: candidate.identity.filePath,
        text,
        fullFileCharacterOffsets: range
      });
      stateTruncated ||= this.remember(state, { identity, text, tool }, callIndex);
      return { text, sourceIdentity: identity };
    });
    const coveredBy = this.coveredBy(proven.map((item) => item.delivered));
    return {
      projection: "partial",
      metadata: {
        policy: MCP_SOURCE_SESSION_POLICY,
        status: "partially-served",
        sourceId: candidate.identity.id,
        callIndex,
        tool,
        coveredCharacterOffsets: covered,
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
  ): ProvenCoverage[] {
    const candidateRange = candidate.identity.fullFileCharacterOffsets;
    const coverage: ProvenCoverage[] = [];
    for (const delivered of state.sources.values()) {
      if (delivered.identity.filePath !== candidate.identity.filePath) continue;
      const deliveredRange = delivered.identity.fullFileCharacterOffsets;
      if (rangeLength(deliveredRange) !== delivered.text.length) continue;
      const start = Math.max(candidateRange.start, deliveredRange.start);
      const end = Math.min(candidateRange.end, deliveredRange.end);
      if (end <= start) continue;
      const candidateOverlap = candidate.text.slice(start - candidateRange.start, end - candidateRange.start);
      const deliveredOverlap = delivered.text.slice(start - deliveredRange.start, end - deliveredRange.start);
      if (candidateOverlap !== deliveredOverlap) continue;
      coverage.push({ start, end, delivered });
    }
    return coverage;
  }

  private referenceDelivery(
    candidate: Candidate,
    delivered: readonly DeliveredSource[],
    covered: readonly CharacterRange[]
  ): Delivery {
    const coveredBy = this.coveredBy(delivered);
    const first = coveredBy[0]!;
    return {
      projection: "reference",
      metadata: {
        policy: MCP_SOURCE_SESSION_POLICY,
        status: "already-served",
        sourceId: candidate.identity.id,
        firstDeliveredCallIndex: first.firstDeliveredCallIndex,
        firstDeliveredTool: first.firstDeliveredTool,
        coveredCharacterOffsets: covered,
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
        firstDeliveredTool: source.firstDeliveredTool
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
    if (tool === "node") {
      if (!isRecord(structured.source) || typeof structured.source.text !== "string" ||
        typeof structured.source.filePath !== "string") return null;
      const identity = sourceIdentity(
        structured.source.sourceIdentity,
        structured.source.text,
        structured.source.filePath
      );
      return identity === null ? null : [{ identity, text: structured.source.text, tool }];
    }
    if (tool === "file") {
      if (structured.contentAvailability !== "active-generation" || !Array.isArray(structured.lines)) return null;
      const lineTexts: string[] = [];
      for (const line of structured.lines) {
        if (!isRecord(line) || typeof line.text !== "string") return null;
        lineTexts.push(line.text);
      }
      if (lineTexts.length === 0) return null;
      const text = lineTexts.join("\n");
      if (!isRecord(structured.selection) || typeof structured.selection.filePath !== "string") return null;
      const identity = sourceIdentity(structured.sourceIdentity, text, structured.selection.filePath);
      return identity === null ? null : [{ identity, text, tool }];
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
        declarationCandidates.push({ identity, text: segment.text, tool });
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

  private applyDeliveries(
    structured: Record<string, unknown>,
    tool: McpSourceTool,
    deliveries: readonly Delivery[]
  ): Record<string, unknown> | null {
    if (tool === "node") {
      if (!isRecord(structured.source) || deliveries.length !== 1) return null;
      return {
        ...structured,
        source: {
        ...structured.source,
          text: deliveries[0]!.projection === "full" ? structured.source.text : null,
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
