import { describe, expect, it } from "vitest";

import {
  scoreComparisonCases,
  type ComparisonCaseObservation
} from "../../../src/benchmark/comparison-metrics.js";

describe("scoreComparisonCases", () => {
  it("reports exact micro and per-case precision, recall, F1, and unresolved rate", () => {
    const cases: ComparisonCaseObservation[] = [
      {
        id: "java-exact-call",
        projectId: "fixture-java",
        language: "java",
        expected: ["calls|app.Main.run|app.Service.execute", "contains|app.Main|app.Main.run"],
        observed: ["contains|app.Main|app.Main.run", "calls|app.Main.run|app.Other.execute"]
      },
      {
        id: "typescript-import",
        projectId: "fixture-typescript",
        language: "typescript",
        expected: ["imports|src/app.ts|src/service.ts"],
        observed: ["imports|src/app.ts|src/service.ts"]
      }
    ];

    expect(scoreComparisonCases(cases)).toEqual({
      cases: [
        {
          id: "java-exact-call",
          projectId: "fixture-java",
          language: "java",
          expectedCount: 2,
          observedCount: 2,
          truePositives: ["contains|app.Main|app.Main.run"],
          falsePositives: ["calls|app.Main.run|app.Other.execute"],
          falseNegatives: ["calls|app.Main.run|app.Service.execute"],
          metrics: { precision: 0.5, recall: 0.5, f1: 0.5, unresolvedRate: 0.5 }
        },
        {
          id: "typescript-import",
          projectId: "fixture-typescript",
          language: "typescript",
          expectedCount: 1,
          observedCount: 1,
          truePositives: ["imports|src/app.ts|src/service.ts"],
          falsePositives: [],
          falseNegatives: [],
          metrics: { precision: 1, recall: 1, f1: 1, unresolvedRate: 0 }
        }
      ],
      micro: {
        expectedCount: 3,
        observedCount: 3,
        truePositiveCount: 2,
        falsePositiveCount: 1,
        falseNegativeCount: 1,
        precision: 2 / 3,
        recall: 2 / 3,
        f1: 2 / 3,
        unresolvedRate: 1 / 3
      },
      macro: {
        precision: 0.75,
        recall: 0.75,
        f1: 0.75,
        unresolvedRate: 0.25
      }
    });
  });

  it("treats a clean negative case as complete and exposes unexpected observations", () => {
    expect(scoreComparisonCases([
      {
        id: "negative-clean",
        projectId: "fixture-java",
        language: "java",
        expected: [],
        observed: []
      },
      {
        id: "negative-false-edge",
        projectId: "fixture-java",
        language: "java",
        expected: [],
        observed: ["calls|app.Main.run|app.Unrelated.execute"]
      }
    ])).toMatchObject({
      cases: [
        { id: "negative-clean", metrics: { precision: 1, recall: 1, f1: 1, unresolvedRate: 0 } },
        {
          id: "negative-false-edge",
          falsePositives: ["calls|app.Main.run|app.Unrelated.execute"],
          metrics: { precision: 0, recall: 1, f1: 0, unresolvedRate: 0 }
        }
      ],
      micro: {
        expectedCount: 0,
        observedCount: 1,
        truePositiveCount: 0,
        falsePositiveCount: 1,
        falseNegativeCount: 0,
        precision: 0,
        recall: 1,
        f1: 0,
        unresolvedRate: 0
      }
    });
  });

  it("rejects duplicate identities and malformed canonical observations", () => {
    expect(() => scoreComparisonCases([])).toThrow("At least one comparison case");
    expect(() => scoreComparisonCases([
      {
        id: "duplicate",
        projectId: "fixture",
        language: "java",
        expected: ["calls|a|b", "calls|a|b"],
        observed: []
      }
    ])).toThrow("duplicate expected observation");
    expect(() => scoreComparisonCases([
      {
        id: "malformed",
        projectId: "fixture",
        language: "java",
        expected: ["calls|a"],
        observed: []
      }
    ])).toThrow("kind|source|target");
    expect(() => scoreComparisonCases([
      {
        id: "same-id",
        projectId: "fixture-a",
        language: "java",
        expected: [],
        observed: []
      },
      {
        id: "same-id",
        projectId: "fixture-b",
        language: "typescript",
        expected: [],
        observed: []
      }
    ])).toThrow("duplicate comparison case id");
  });
});
