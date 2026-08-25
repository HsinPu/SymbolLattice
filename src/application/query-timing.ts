/**
 * Lightweight timing seam for the explore read path.
 *
 * The default sink is deliberately a no-op so normal CLI and MCP requests do
 * not allocate timing events.  Hosts and tests can inject a recording sink
 * while keeping the query result and public response shape unchanged.
 */

export const QUERY_TIMING_STAGES = [
  "snapshot",
  "seed-retrieval",
  "planning",
  "path-spine",
  "context",
  "source",
  "status",
  "render"
] as const;

export type QueryTimingStage = (typeof QUERY_TIMING_STAGES)[number];

export type QueryTimingAttribute = string | number | boolean | null;

export type QueryTimingAttributes = Readonly<Record<string, QueryTimingAttribute>>;

export interface QueryTimingEvent {
  readonly stage: QueryTimingStage;
  readonly durationMs: number;
  readonly attributes?: QueryTimingAttributes;
}

export interface QueryTimingSpan {
  end(attributes?: QueryTimingAttributes): void;
}

export interface QueryTimingSink {
  /** Starts one bounded span. Calling `end` more than once is a no-op. */
  start(stage: QueryTimingStage, attributes?: QueryTimingAttributes): QueryTimingSpan;
}

const NOOP_QUERY_TIMING_SPAN: QueryTimingSpan = Object.freeze({
  end: () => undefined
});

/** Shared default used by production callers when timing is not requested. */
export const NOOP_QUERY_TIMING_SINK: QueryTimingSink = Object.freeze({
  start: () => NOOP_QUERY_TIMING_SPAN
});

export interface RecordingQueryTimingSinkOptions {
  /** Injectable clock keeps unit tests deterministic. Defaults to monotonic ms. */
  readonly now?: () => number;
}

/**
 * In-memory sink intended for profiling, tests, and benchmark harnesses.
 * Events are returned as a defensive copy so callers cannot mutate the
 * recorder's history.
 */
export class RecordingQueryTimingSink implements QueryTimingSink {
  private readonly now: () => number;
  private readonly recordedEvents: QueryTimingEvent[] = [];

  public constructor(options: RecordingQueryTimingSinkOptions = {}) {
    this.now = options.now ?? (() => Number(process.hrtime.bigint()) / 1_000_000);
  }

  public start(stage: QueryTimingStage, attributes?: QueryTimingAttributes): QueryTimingSpan {
    const startedAt = this.now();
    let ended = false;
    return {
      end: (endAttributes) => {
        if (ended) return;
        ended = true;
        const mergedAttributes = mergeAttributes(attributes, endAttributes);
        const event: QueryTimingEvent = {
          stage,
          durationMs: Math.max(0, this.now() - startedAt),
          ...(mergedAttributes === undefined ? {} : { attributes: mergedAttributes })
        };
        this.recordedEvents.push(event);
      }
    };
  }

  public events(): readonly QueryTimingEvent[] {
    return this.recordedEvents.map((event) => ({
      ...event,
      ...(event.attributes === undefined ? {} : { attributes: { ...event.attributes } })
    }));
  }

  public clear(): void {
    this.recordedEvents.length = 0;
  }
}

/**
 * Measures synchronous or asynchronous work without forcing callers to make
 * their hot path async solely for instrumentation.
 */
export function measureQueryTiming<T>(
  sink: QueryTimingSink,
  stage: QueryTimingStage,
  operation: () => T,
  attributes?: QueryTimingAttributes
): T;
export function measureQueryTiming<T>(
  sink: QueryTimingSink,
  stage: QueryTimingStage,
  operation: () => Promise<T>,
  attributes?: QueryTimingAttributes
): Promise<T>;
export function measureQueryTiming<T>(
  sink: QueryTimingSink,
  stage: QueryTimingStage,
  operation: () => T | Promise<T>,
  attributes?: QueryTimingAttributes
): T | Promise<T> {
  const span = sink.start(stage, attributes);
  try {
    const result = operation();
    if (isPromiseLike(result)) {
      return result.then(
        (value) => {
          span.end();
          return value;
        },
        (error: unknown) => {
          span.end({ error: true });
          throw error;
        }
      ) as Promise<T>;
    }
    span.end();
    return result;
  } catch (error) {
    span.end({ error: true });
    throw error;
  }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function mergeAttributes(
  startAttributes: QueryTimingAttributes | undefined,
  endAttributes: QueryTimingAttributes | undefined
): QueryTimingAttributes | undefined {
  if (startAttributes === undefined && endAttributes === undefined) return undefined;
  return { ...(startAttributes ?? {}), ...(endAttributes ?? {}) };
}
