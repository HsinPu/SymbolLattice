import {
  SOURCE_DELIVERY_IDENTITY_POLICY,
  sourceDeliveryIdentityFromText,
  type SourceDeliveryIdentity
} from "../application/source-delivery.js";

export const MCP_SOURCE_SESSION_POLICY = "mcp-session-source-dedup-v2" as const;
export const MCP_SOURCE_SESSION_MODES = ["deduplicate", "full"] as const;
export type McpSourceSessionMode = (typeof MCP_SOURCE_SESSION_MODES)[number];
export type McpSourceTool = "node" | "investigate" | "file";

export const MCP_SOURCE_SESSION_LIMITS = {
  maximumProjects: 4,
  maximumSourcesPerProject: 256
} as const;

export interface McpSourceSessionOptions {
  readonly maximumProjects?: number;
  readonly maximumSourcesPerProject?: number;
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
  readonly referenced: boolean;
  readonly metadata: Record<string, unknown>;
}

function boundedPositive(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
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

/** Session-local, post-worker exact-source registry shared by node, investigate, and file. */
export class McpSourceSession {
  private readonly maximumProjects: number;
  private readonly maximumSourcesPerProject: number;
  private readonly projects = new Map<string, ProjectSessionState>();

  public constructor(options: McpSourceSessionOptions = {}) {
    this.maximumProjects = boundedPositive(options.maximumProjects, MCP_SOURCE_SESSION_LIMITS.maximumProjects);
    this.maximumSourcesPerProject = boundedPositive(
      options.maximumSourcesPerProject,
      MCP_SOURCE_SESSION_LIMITS.maximumSourcesPerProject
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
    let referencedSources = 0;
    let emittedCharacters = 0;
    let avoidedCharacters = 0;
    let stateTruncated = selected.projectEvicted;
    const deliveries = candidates.map((candidate): Delivery => {
      const prior = selected.state.sources.get(candidate.identity.id);
      const referenced = mode === "deduplicate" && prior !== undefined &&
        prior.identity.contentSha256 === candidate.identity.contentSha256;
      if (referenced) {
        referencedSources += 1;
        avoidedCharacters += candidate.text.length;
        return {
          referenced: true,
          metadata: {
            policy: MCP_SOURCE_SESSION_POLICY,
            status: "already-served",
            sourceId: candidate.identity.id,
            firstDeliveredCallIndex: prior.firstDeliveredCallIndex,
            firstDeliveredTool: prior.firstDeliveredTool,
            message: `Exact source ${candidate.identity.id} was already delivered by ${prior.firstDeliveredTool} during project call ${prior.firstDeliveredCallIndex}; project generation and content still match.`
          }
        };
      }
      emittedSources += 1;
      emittedCharacters += candidate.text.length;
      if (prior === undefined) {
        selected.state.sources.set(candidate.identity.id, {
          identity: candidate.identity,
          firstDeliveredCallIndex: callIndex,
          firstDeliveredTool: tool
        });
      }
      while (selected.state.sources.size > this.maximumSourcesPerProject) {
        const oldest = selected.state.sources.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        selected.state.sources.delete(oldest);
        stateTruncated = true;
      }
      return {
        referenced: false,
        metadata: {
          policy: MCP_SOURCE_SESSION_POLICY,
          status: "emitted",
          sourceId: candidate.identity.id,
          callIndex,
          tool
        }
      };
    });

    const projected = this.applyDeliveries(header.structured, tool, deliveries);
    if (projected === null) return response;
    const structuredContent = {
      ...projected,
      sessionSource: {
        policy: MCP_SOURCE_SESSION_POLICY,
        scope: "mcp-server-session",
        identityPolicy: SOURCE_DELIVERY_IDENTITY_POLICY,
        equality: "exact-file-offsets-and-canonical-content",
        mode,
        tool,
        projectPath: header.projectPath,
        generationId: header.generationId,
        callIndex,
        generationReset: selected.generationReset,
        bounds: {
          maximumProjects: this.maximumProjects,
          maximumSourcesPerProject: this.maximumSourcesPerProject
        },
        summary: {
          candidateSources: candidates.length,
          emittedSources,
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
          text: deliveries[0]!.referenced ? null : structured.source.text,
          delivery: deliveries[0]!.metadata
        }
      };
    }
    if (tool === "file") {
      if (deliveries.length !== 1) return null;
      return {
        ...structured,
        lines: deliveries[0]!.referenced ? [] : structured.lines,
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
        if (!delivery.referenced) return { ...segment, delivery: delivery.metadata };
        const { text: _text, ...metadata } = segment;
        return { ...metadata, delivery: delivery.metadata };
      });
      const primaryIndex = declaration.source.primarySegmentIndex;
      const primary = Number.isSafeInteger(primaryIndex) ? deliveries[deliveryIndex - renderedSegments.length + (primaryIndex as number)] : undefined;
      return {
        ...declaration,
        source: {
          ...declaration.source,
          text: primary?.referenced === true ? null : declaration.source.text,
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
