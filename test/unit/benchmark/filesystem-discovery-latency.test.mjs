import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const benchmarkPath = join(repositoryRoot, "benchmarks", "filesystem", "discovery-latency.mjs");

describe("filesystem discovery latency benchmark", () => {
  it("keeps a generic persistent 3-warmup/30-measurement contract", () => {
    const source = readFileSync(benchmarkPath, "utf8");
    expect(source).toContain("const WARMUP_REQUESTS = 3");
    expect(source).toContain("const MEASURED_REQUESTS = 30");
    expect(source).toContain("persistentProcess: true");
    expect(source).toContain('p50: rounded(percentile(samples, 0.5))');
    expect(source).toContain('p95: rounded(percentile(samples, 0.95))');
    expect(source).toContain('mean: rounded(samples.reduce');
    expect(source).toContain('max: rounded(Math.max(...samples))');
    expect(source).not.toContain("@hsinpu/");
  });
});
