export interface OperationSample {
  readonly durationMs: number;
  readonly peakRssBytes: number | null;
}

export interface ScalarSampleStatistics<Unit extends "milliseconds" | "bytes"> {
  readonly unit: Unit;
  readonly minimum: number;
  readonly median: number;
  readonly p95: number;
  readonly maximum: number;
  readonly medianAbsoluteDeviation: number;
  readonly outlierSampleIndexes: readonly number[];
}

export interface OperationSampleSummary {
  readonly policy: "repeated-operation-samples-v1";
  readonly sampleCount: number;
  readonly outlierPolicy: "median-absolute-deviation-3x-v1";
  readonly duration: ScalarSampleStatistics<"milliseconds">;
  readonly peakRss:
    | (ScalarSampleStatistics<"bytes"> & {
        readonly supportedSampleCount: number;
        readonly missingSampleCount: number;
      })
    | {
        readonly unit: "bytes";
        readonly supportedSampleCount: 0;
        readonly missingSampleCount: number;
        readonly statistics: null;
        readonly outlierSampleIndexes: readonly [];
      };
}

function nearestRank(sortedValues: readonly number[], ratio: number): number {
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1)
  );
  return sortedValues[index] as number;
}

function statistics<Unit extends "milliseconds" | "bytes">(
  rawValues: readonly number[],
  unit: Unit
): ScalarSampleStatistics<Unit> {
  const sortedValues = [...rawValues].sort((left, right) => left - right);
  const median = nearestRank(sortedValues, 0.5);
  const deviations = rawValues.map((value) => Math.abs(value - median));
  const medianAbsoluteDeviation = nearestRank(
    [...deviations].sort((left, right) => left - right),
    0.5
  );
  const outlierThreshold = medianAbsoluteDeviation * 3;
  return {
    unit,
    minimum: sortedValues[0] as number,
    median,
    p95: nearestRank(sortedValues, 0.95),
    maximum: sortedValues[sortedValues.length - 1] as number,
    medianAbsoluteDeviation,
    outlierSampleIndexes: deviations
      .map((deviation, index) => ({ deviation, index }))
      .filter(({ deviation }) => deviation > outlierThreshold)
      .map(({ index }) => index)
  };
}

/** Summarizes raw sequential operation samples without hiding unsupported RSS measurements. */
export function summarizeOperationSamples(
  samples: readonly OperationSample[]
): OperationSampleSummary {
  if (samples.length === 0) {
    throw new RangeError("At least one operation sample is required.");
  }
  for (const sample of samples) {
    if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) {
      throw new RangeError("Operation durations must be finite non-negative milliseconds.");
    }
    if (
      sample.peakRssBytes !== null &&
      (!Number.isSafeInteger(sample.peakRssBytes) || sample.peakRssBytes < 0)
    ) {
      throw new RangeError("Operation RSS samples must be null or non-negative safe bytes.");
    }
  }

  const rssSamples = samples
    .map((sample, index) => ({ index, value: sample.peakRssBytes }))
    .filter((sample): sample is { readonly index: number; readonly value: number } =>
      sample.value !== null
    );
  const duration = statistics(samples.map((sample) => sample.durationMs), "milliseconds");
  const peakRss = rssSamples.length === 0
    ? {
        unit: "bytes" as const,
        supportedSampleCount: 0 as const,
        missingSampleCount: samples.length,
        statistics: null,
        outlierSampleIndexes: [] as const
      }
    : (() => {
        const supportedStatistics = statistics(
          rssSamples.map((sample) => sample.value),
          "bytes"
        );
        const rawSupportedIndexes = rssSamples.map((sample) => sample.index);
        return {
          ...supportedStatistics,
          outlierSampleIndexes: supportedStatistics.outlierSampleIndexes.map(
            (supportedIndex) => rawSupportedIndexes[supportedIndex] as number
          ),
          supportedSampleCount: rssSamples.length,
          missingSampleCount: samples.length - rssSamples.length
        };
      })();

  return {
    policy: "repeated-operation-samples-v1",
    sampleCount: samples.length,
    outlierPolicy: "median-absolute-deviation-3x-v1",
    duration,
    peakRss
  };
}
