import { describe, expect, it } from "vitest";

import { summarizeOperationSamples } from "../../../src/benchmark/operation-samples.js";

describe("summarizeOperationSamples", () => {
  it("reports bounded units, nearest-rank percentiles, MAD, and raw-sample outliers", () => {
    expect(summarizeOperationSamples([
      { durationMs: 10, peakRssBytes: 100 },
      { durationMs: 11, peakRssBytes: 110 },
      { durationMs: 12, peakRssBytes: 120 },
      { durationMs: 13, peakRssBytes: 130 },
      { durationMs: 100, peakRssBytes: 1_000 }
    ])).toEqual({
      policy: "repeated-operation-samples-v1",
      sampleCount: 5,
      outlierPolicy: "median-absolute-deviation-3x-v1",
      duration: {
        unit: "milliseconds",
        minimum: 10,
        median: 12,
        p95: 100,
        maximum: 100,
        medianAbsoluteDeviation: 1,
        outlierSampleIndexes: [4]
      },
      peakRss: {
        unit: "bytes",
        supportedSampleCount: 5,
        missingSampleCount: 0,
        minimum: 100,
        median: 120,
        p95: 1_000,
        maximum: 1_000,
        medianAbsoluteDeviation: 10,
        outlierSampleIndexes: [4]
      }
    });
  });

  it("keeps unsupported working-set samples missing instead of converting them to zero", () => {
    const summary = summarizeOperationSamples([
      { durationMs: 2, peakRssBytes: null },
      { durationMs: 1, peakRssBytes: null },
      { durationMs: 3, peakRssBytes: null }
    ]);

    expect(summary.duration).toMatchObject({ median: 2, p95: 3 });
    expect(summary.peakRss).toEqual({
      unit: "bytes",
      supportedSampleCount: 0,
      missingSampleCount: 3,
      statistics: null,
      outlierSampleIndexes: []
    });
  });

  it("rejects empty, non-finite, negative, and unsafe-integer samples", () => {
    expect(() => summarizeOperationSamples([])).toThrow(RangeError);
    expect(() => summarizeOperationSamples([
      { durationMs: Number.NaN, peakRssBytes: 1 }
    ])).toThrow(RangeError);
    expect(() => summarizeOperationSamples([
      { durationMs: -1, peakRssBytes: 1 }
    ])).toThrow(RangeError);
    expect(() => summarizeOperationSamples([
      { durationMs: 1, peakRssBytes: 1.5 }
    ])).toThrow(RangeError);
  });
});
