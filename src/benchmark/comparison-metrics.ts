export interface ComparisonCaseObservation {
  readonly id: string;
  readonly projectId: string;
  readonly language: string;
  /** Canonical `kind|source|target` relations selected by the curated ground truth. */
  readonly expected: readonly string[];
  /** Canonical relations returned inside the same bounded comparison scope. */
  readonly observed: readonly string[];
}

export interface ComparisonMetrics {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly unresolvedRate: number;
}

export interface ComparisonCaseScore {
  readonly id: string;
  readonly projectId: string;
  readonly language: string;
  readonly expectedCount: number;
  readonly observedCount: number;
  readonly truePositives: readonly string[];
  readonly falsePositives: readonly string[];
  readonly falseNegatives: readonly string[];
  readonly metrics: ComparisonMetrics;
}

export interface ComparisonScore {
  readonly cases: readonly ComparisonCaseScore[];
  readonly micro: ComparisonMetrics & {
    readonly expectedCount: number;
    readonly observedCount: number;
    readonly truePositiveCount: number;
    readonly falsePositiveCount: number;
    readonly falseNegativeCount: number;
  };
  readonly macro: ComparisonMetrics;
}

function requireIdentity(value: string, label: string): string {
  if (value.length === 0 || value !== value.trim() || /[\r\n]/u.test(value)) {
    throw new Error(`${label} must be a non-empty trimmed single-line string.`);
  }
  return value;
}

function requireCanonicalObservation(value: string, label: string): string {
  requireIdentity(value, label);
  const parts = value.split("|");
  if (parts.length !== 3 || parts.some((part) => part.length === 0 || part !== part.trim())) {
    throw new Error(`${label} must use canonical kind|source|target form.`);
  }
  return value;
}

function uniqueObservations(values: readonly string[], label: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const canonical = requireCanonicalObservation(value, label);
    if (seen.has(canonical)) {
      throw new Error(`${label} contains a duplicate ${label.includes("expected") ? "expected" : "observed"} observation: ${canonical}`);
    }
    seen.add(canonical);
  }
  return [...seen].sort((left, right) => left.localeCompare(right, "en"));
}

function ratio(numerator: number, denominator: number, emptyValue: number): number {
  return denominator === 0 ? emptyValue : numerator / denominator;
}

function metrics(
  truePositiveCount: number,
  falsePositiveCount: number,
  falseNegativeCount: number
): ComparisonMetrics {
  const precision = ratio(truePositiveCount, truePositiveCount + falsePositiveCount, 1);
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount, 1);
  return {
    precision,
    recall,
    f1: ratio(2 * precision * recall, precision + recall, 0),
    unresolvedRate: ratio(falseNegativeCount, truePositiveCount + falseNegativeCount, 0)
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Scores curated, bounded relation sets without treating unscored repository edges as truth.
 * Every adapter must apply the same case scope before passing observations to this function.
 */
export function scoreComparisonCases(
  observations: readonly ComparisonCaseObservation[]
): ComparisonScore {
  if (observations.length === 0) {
    throw new RangeError("At least one comparison case is required.");
  }

  const caseIds = new Set<string>();
  const cases = observations.map((observation): ComparisonCaseScore => {
    const id = requireIdentity(observation.id, "Comparison case id");
    if (caseIds.has(id)) {
      throw new Error(`Found duplicate comparison case id: ${id}`);
    }
    caseIds.add(id);
    const projectId = requireIdentity(observation.projectId, `Comparison case ${id} projectId`);
    const language = requireIdentity(observation.language, `Comparison case ${id} language`);
    const expected = uniqueObservations(observation.expected, `Comparison case ${id} expected observations`);
    const observed = uniqueObservations(observation.observed, `Comparison case ${id} observed observations`);
    const expectedSet = new Set(expected);
    const observedSet = new Set(observed);
    const truePositives = expected.filter((value) => observedSet.has(value));
    const falsePositives = observed.filter((value) => !expectedSet.has(value));
    const falseNegatives = expected.filter((value) => !observedSet.has(value));

    return {
      id,
      projectId,
      language,
      expectedCount: expected.length,
      observedCount: observed.length,
      truePositives,
      falsePositives,
      falseNegatives,
      metrics: metrics(truePositives.length, falsePositives.length, falseNegatives.length)
    };
  });

  const expectedCount = cases.reduce((total, item) => total + item.expectedCount, 0);
  const observedCount = cases.reduce((total, item) => total + item.observedCount, 0);
  const truePositiveCount = cases.reduce((total, item) => total + item.truePositives.length, 0);
  const falsePositiveCount = cases.reduce((total, item) => total + item.falsePositives.length, 0);
  const falseNegativeCount = cases.reduce((total, item) => total + item.falseNegatives.length, 0);

  return {
    cases,
    micro: {
      expectedCount,
      observedCount,
      truePositiveCount,
      falsePositiveCount,
      falseNegativeCount,
      ...metrics(truePositiveCount, falsePositiveCount, falseNegativeCount)
    },
    macro: {
      precision: mean(cases.map((item) => item.metrics.precision)),
      recall: mean(cases.map((item) => item.metrics.recall)),
      f1: mean(cases.map((item) => item.metrics.f1)),
      unresolvedRate: mean(cases.map((item) => item.metrics.unresolvedRate))
    }
  };
}
