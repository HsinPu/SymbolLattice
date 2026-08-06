import {
  INVESTIGATION_SOURCE_SEGMENT_POLICY,
  investigationSourceSegmentIdentity,
  type InvestigationSourceSegmentRole
} from "../application/context-rendering.js";

export const MCP_INVESTIGATE_SOURCE_SESSION_POLICY = "mcp-session-source-dedup-v1" as const;
export const MCP_INVESTIGATE_SOURCE_SESSION_MODES = ["deduplicate", "full"] as const;
export type McpInvestigateSourceSessionMode =
  (typeof MCP_INVESTIGATE_SOURCE_SESSION_MODES)[number];

export const MCP_INVESTIGATE_SOURCE_SESSION_LIMITS = {
  maximumProjects: 4,
  maximumSegmentsPerProject: 256
} as const;

export interface McpInvestigateSourceSessionOptions {
  readonly maximumProjects?: number;
  readonly maximumSegmentsPerProject?: number;
}

interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export interface InvestigateSessionSourceResponse {
  readonly [key: string]: unknown;
  readonly content: readonly TextContent[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

interface SourceOffsets {
  readonly start: number;
  readonly end: number;
}

interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

interface CandidateSegment {
  readonly id: string;
  readonly text: string;
  readonly contentSha256: string;
  readonly sourceCharacterOffsets: SourceOffsets;
  readonly raw: Record<string, unknown>;
}

interface CandidateDeclaration {
  readonly index: number;
  readonly reference: string;
  readonly source: Record<string, unknown>;
  readonly segments: readonly CandidateSegment[];
  readonly primarySegmentIndex: number;
}

interface CompatibleResult {
  readonly projectPath: string;
  readonly generationId: string;
  readonly declarations: readonly CandidateDeclaration[];
  readonly structuredContent: Record<string, unknown>;
}

interface DeliveredSegment {
  readonly id: string;
  readonly contentSha256: string;
  readonly sourceCharacterOffsets: SourceOffsets;
  readonly firstDeliveredCallIndex: number;
}

interface ProjectSessionState {
  generationId: string;
  callCount: number;
  readonly segments: Map<string, DeliveredSegment>;
}

function boundedPositive(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is SourcePosition {
  return isRecord(value) && Number.isSafeInteger(value.line) && (value.line as number) > 0 &&
    Number.isSafeInteger(value.column) && (value.column as number) > 0;
}

function isRange(value: unknown): value is SourceRange {
  return isRecord(value) && isPosition(value.start) && isPosition(value.end);
}

function isOffsets(value: unknown): value is SourceOffsets {
  return isRecord(value) && Number.isSafeInteger(value.start) && (value.start as number) >= 0 &&
    Number.isSafeInteger(value.end) && (value.end as number) >= (value.start as number);
}

const SEGMENT_ROLES = new Set<InvestigationSourceSegmentRole>([
  "full",
  "prefix",
  "signature",
  "focus"
]);

function candidateSegment(
  value: unknown,
  filePath: string,
  declarationReference: string
): CandidateSegment | null {
  if (!isRecord(value) || value.policy !== INVESTIGATION_SOURCE_SEGMENT_POLICY ||
    typeof value.id !== "string" || typeof value.text !== "string" ||
    typeof value.contentSha256 !== "string" || value.contiguous !== true ||
    typeof value.lineAligned !== "boolean" || !isRange(value.renderedRange) ||
    !isOffsets(value.sourceCharacterOffsets) || !Array.isArray(value.roles) ||
    value.roles.length === 0 || !value.roles.every(
      (role) => typeof role === "string" && SEGMENT_ROLES.has(role as InvestigationSourceSegmentRole)
    )) {
    return null;
  }
  const identity = investigationSourceSegmentIdentity({
    filePath,
    declarationReference,
    sourceCharacterOffsets: value.sourceCharacterOffsets,
    text: value.text
  });
  if (identity.id !== value.id || identity.contentSha256 !== value.contentSha256) {
    return null;
  }
  return {
    id: value.id,
    text: value.text,
    contentSha256: value.contentSha256,
    sourceCharacterOffsets: value.sourceCharacterOffsets,
    raw: value
  };
}

function compatibleResult(response: InvestigateSessionSourceResponse): CompatibleResult | null {
  if (response.isError === true || !isRecord(response.structuredContent)) {
    return null;
  }
  const structuredContent = response.structuredContent;
  const status = structuredContent.status;
  const declarations = structuredContent.declarations;
  if (!isRecord(status) || typeof status.projectPath !== "string" || status.projectPath.length === 0 ||
    typeof status.generationId !== "string" || status.generationId.length === 0 ||
    !Array.isArray(declarations)) {
    return null;
  }

  const compatibleDeclarations: CandidateDeclaration[] = [];
  const seenSegmentIds = new Set<string>();
  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index];
    if (!isRecord(declaration) || typeof declaration.reference !== "string") {
      return null;
    }
    if (declaration.source === null || declaration.sourceAvailability !== "active-generation") {
      continue;
    }
    const source = declaration.source;
    if (!isRecord(source) || typeof source.filePath !== "string" ||
      !Array.isArray(source.renderedSegments) ||
      !Number.isSafeInteger(source.primarySegmentIndex) ||
      (source.primarySegmentIndex as number) < 0 ||
      (source.primarySegmentIndex as number) >= source.renderedSegments.length) {
      return null;
    }
    const segments = source.renderedSegments.map((segment) =>
      candidateSegment(segment, source.filePath as string, declaration.reference as string)
    );
    if (segments.some((segment) => segment === null)) {
      return null;
    }
    const provenSegments = segments as CandidateSegment[];
    for (const segment of provenSegments) {
      if (seenSegmentIds.has(segment.id)) {
        return null;
      }
      seenSegmentIds.add(segment.id);
    }
    const primary = provenSegments[source.primarySegmentIndex as number];
    if (primary === undefined || source.text !== primary.text) {
      return null;
    }
    compatibleDeclarations.push({
      index,
      reference: declaration.reference,
      source,
      segments: provenSegments,
      primarySegmentIndex: source.primarySegmentIndex as number
    });
  }

  if (compatibleDeclarations.length === 0) {
    return null;
  }
  return {
    projectPath: status.projectPath,
    generationId: status.generationId,
    declarations: compatibleDeclarations,
    structuredContent
  };
}

function deliveredMatches(candidate: CandidateSegment, delivered: DeliveredSegment): boolean {
  return candidate.id === delivered.id &&
    candidate.contentSha256 === delivered.contentSha256 &&
    candidate.sourceCharacterOffsets.start === delivered.sourceCharacterOffsets.start &&
    candidate.sourceCharacterOffsets.end === delivered.sourceCharacterOffsets.end;
}

function backReferenceMessage(
  filePath: string,
  declarationReference: string,
  segment: CandidateSegment,
  firstDeliveredCallIndex: number
): string {
  const offsets = segment.sourceCharacterOffsets;
  return `Exact source segment ${segment.id} for ${declarationReference} in ${filePath} ` +
    `(UTF-16 offsets ${offsets.start}-${offsets.end}) was already delivered in this MCP session ` +
    `during project call ${firstDeliveredCallIndex}; its generation and content identity still match.`;
}

/**
 * Session-local post-processing for successful investigate responses. State is
 * deliberately owned by one MCP server instance and never sent to query workers.
 */
export class McpInvestigateSourceSession {
  private readonly maximumProjects: number;
  private readonly maximumSegmentsPerProject: number;
  private readonly projects = new Map<string, ProjectSessionState>();

  public constructor(options: McpInvestigateSourceSessionOptions = {}) {
    this.maximumProjects = boundedPositive(
      options.maximumProjects,
      MCP_INVESTIGATE_SOURCE_SESSION_LIMITS.maximumProjects
    );
    this.maximumSegmentsPerProject = boundedPositive(
      options.maximumSegmentsPerProject,
      MCP_INVESTIGATE_SOURCE_SESSION_LIMITS.maximumSegmentsPerProject
    );
  }

  public project<TResponse extends InvestigateSessionSourceResponse>(
    response: TResponse,
    mode: McpInvestigateSourceSessionMode
  ): TResponse {
    if (!MCP_INVESTIGATE_SOURCE_SESSION_MODES.includes(mode)) {
      return response;
    }
    const compatible = compatibleResult(response);
    if (compatible === null) {
      return response;
    }

    const { state, generationReset, projectEvicted } = this.projectState(
      compatible.projectPath,
      compatible.generationId
    );
    state.callCount += 1;
    const callIndex = state.callCount;
    let candidateSegments = 0;
    let emittedSegments = 0;
    let referencedSegments = 0;
    let emittedCharacters = 0;
    let avoidedCharacters = 0;
    let stateTruncated = projectEvicted;
    const declarations = [...(compatible.structuredContent.declarations as unknown[])];

    for (const declaration of compatible.declarations) {
      const originalDeclaration = declarations[declaration.index] as Record<string, unknown>;
      const projectedSegments: Record<string, unknown>[] = [];
      for (const segment of declaration.segments) {
        candidateSegments += 1;
        const prior = state.segments.get(segment.id);
        const referenced = mode === "deduplicate" && prior !== undefined &&
          deliveredMatches(segment, prior);
        if (referenced) {
          referencedSegments += 1;
          avoidedCharacters += segment.text.length;
          const { text: _text, ...metadata } = segment.raw;
          projectedSegments.push({
            ...metadata,
            delivery: {
              policy: MCP_INVESTIGATE_SOURCE_SESSION_POLICY,
              status: "already-served",
              segmentId: segment.id,
              firstDeliveredCallIndex: prior.firstDeliveredCallIndex,
              message: backReferenceMessage(
                declaration.source.filePath as string,
                declaration.reference,
                segment,
                prior.firstDeliveredCallIndex
              )
            }
          });
          continue;
        }

        emittedSegments += 1;
        emittedCharacters += segment.text.length;
        projectedSegments.push({
          ...segment.raw,
          delivery: {
            policy: MCP_INVESTIGATE_SOURCE_SESSION_POLICY,
            status: "emitted",
            segmentId: segment.id,
            callIndex
          }
        });
        if (prior === undefined) {
          state.segments.set(segment.id, {
            id: segment.id,
            contentSha256: segment.contentSha256,
            sourceCharacterOffsets: segment.sourceCharacterOffsets,
            firstDeliveredCallIndex: callIndex
          });
        }
        while (state.segments.size > this.maximumSegmentsPerProject) {
          const oldest = state.segments.keys().next().value as string | undefined;
          if (oldest === undefined) {
            break;
          }
          state.segments.delete(oldest);
          stateTruncated = true;
        }
      }

      const primaryDelivery = projectedSegments[declaration.primarySegmentIndex]?.delivery;
      const primaryWasReferenced = isRecord(primaryDelivery) &&
        primaryDelivery.status === "already-served";
      declarations[declaration.index] = {
        ...originalDeclaration,
        source: {
          ...declaration.source,
          text: primaryWasReferenced ? null : declaration.source.text,
          renderedSegments: projectedSegments
        }
      };
    }

    const structuredContent = {
      ...compatible.structuredContent,
      declarations,
      sessionSource: {
        policy: MCP_INVESTIGATE_SOURCE_SESSION_POLICY,
        scope: "mcp-server-session",
        mode,
        projectPath: compatible.projectPath,
        generationId: compatible.generationId,
        callIndex,
        generationReset,
        bounds: {
          maximumProjects: this.maximumProjects,
          maximumSegmentsPerProject: this.maximumSegmentsPerProject
        },
        summary: {
          candidateSegments,
          emittedSegments,
          referencedSegments,
          emittedCharacters,
          avoidedCharacters,
          stateSegmentsAfterCall: state.segments.size,
          stateTruncated
        }
      }
    };
    return {
      ...response,
      content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent
    } as TResponse;
  }

  private projectState(
    projectPath: string,
    generationId: string
  ): {
    readonly state: ProjectSessionState;
    readonly generationReset: boolean;
    readonly projectEvicted: boolean;
  } {
    const existing = this.projects.get(projectPath);
    if (existing !== undefined) {
      this.projects.delete(projectPath);
      this.projects.set(projectPath, existing);
      if (existing.generationId !== generationId) {
        existing.generationId = generationId;
        existing.segments.clear();
        return { state: existing, generationReset: true, projectEvicted: false };
      }
      return { state: existing, generationReset: false, projectEvicted: false };
    }

    const state: ProjectSessionState = {
      generationId,
      callCount: 0,
      segments: new Map()
    };
    this.projects.set(projectPath, state);
    let projectEvicted = false;
    while (this.projects.size > this.maximumProjects) {
      const oldest = this.projects.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.projects.delete(oldest);
      projectEvicted = true;
    }
    return { state, generationReset: false, projectEvicted };
  }
}
