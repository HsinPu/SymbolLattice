import { describe, expect, it } from "vitest";

import { summarizeReadQueryExecutions } from "../../../src/benchmark/read-query-metrics.js";

describe("summarizeReadQueryExecutions", () => {
  it("reports deterministic nearest-rank latency percentiles and outcome counts", () => {
    const summary = summarizeReadQueryExecutions([
      { latencyMs: 5, usedFallback: false, isError: false },
      { latencyMs: 1, usedFallback: true, isError: false },
      { latencyMs: 3, usedFallback: false, isError: true },
      { latencyMs: 2, usedFallback: false, isError: false },
      { latencyMs: 4, usedFallback: true, isError: true }
    ]);

    expect(summary).toEqual({
      latency: {
        count: 5,
        minimumMs: 1,
        meanMs: 3,
        p50Ms: 3,
        p95Ms: 5,
        maximumMs: 5
      },
      requests: {
        total: 5,
        fallbacks: 2,
        errors: 2
      }
    });
  });

  it("rejects empty and invalid timing input instead of producing misleading metrics", () => {
    expect(() => summarizeReadQueryExecutions([])).toThrow(RangeError);
    expect(() =>
      summarizeReadQueryExecutions([{ latencyMs: Number.NaN, usedFallback: false, isError: false }])
    ).toThrow(RangeError);
    expect(() =>
      summarizeReadQueryExecutions([{ latencyMs: -1, usedFallback: false, isError: false }])
    ).toThrow(RangeError);
  });
});
