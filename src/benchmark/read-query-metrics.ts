export interface ReadQueryExecutionSample {
  readonly latencyMs: number;
  readonly usedFallback: boolean;
  readonly isError: boolean;
}

export interface ReadQueryLatencySummary {
  readonly count: number;
  readonly minimumMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maximumMs: number;
}

export interface ReadQueryExecutionSummary {
  readonly latency: ReadQueryLatencySummary;
  readonly requests: {
    readonly total: number;
    readonly fallbacks: number;
    readonly errors: number;
  };
}

function sortedLatencies(samples: readonly ReadQueryExecutionSample[]): number[] {
  if (samples.length === 0) {
    throw new RangeError("At least one read-query execution sample is required.");
  }

  const values = samples.map((sample) => sample.latencyMs);
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("Read-query latency samples must be finite non-negative numbers.");
    }
  }
  return values.sort((left, right) => left - right);
}

/** Uses nearest-rank percentiles so a small benchmark has deterministic, explainable output. */
function percentile(sortedValues: readonly number[], ratio: number): number {
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index] as number;
}

/**
 * Summarizes completed read-query executions without imposing environment-specific timing limits.
 * Consumers decide how to compare these reproducible measurements across machines or releases.
 */
export function summarizeReadQueryExecutions(
  samples: readonly ReadQueryExecutionSample[]
): ReadQueryExecutionSummary {
  const latencies = sortedLatencies(samples);
  const totalLatency = latencies.reduce((total, latency) => total + latency, 0);

  return {
    latency: {
      count: latencies.length,
      minimumMs: latencies[0] as number,
      meanMs: totalLatency / latencies.length,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      maximumMs: latencies[latencies.length - 1] as number
    },
    requests: {
      total: samples.length,
      fallbacks: samples.filter((sample) => sample.usedFallback).length,
      errors: samples.filter((sample) => sample.isError).length
    }
  };
}
