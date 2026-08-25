import { describe, expect, it } from "vitest";

import {
  NOOP_QUERY_TIMING_SINK,
  QUERY_TIMING_STAGES,
  RecordingQueryTimingSink,
  measureQueryTiming
} from "../../../src/application/query-timing.js";

describe("query timing sink", () => {
  it("keeps the default sink allocation-free and inert", () => {
    expect(NOOP_QUERY_TIMING_SINK.start("snapshot")).toBe(
      NOOP_QUERY_TIMING_SINK.start("render")
    );
    expect(QUERY_TIMING_STAGES).toEqual([
      "snapshot",
      "seed-retrieval",
      "planning",
      "path-spine",
      "context",
      "source",
      "status",
      "render"
    ]);
  });

  it("records one event with merged start and end attributes", () => {
    const clockValues = [10, 17];
    const sink = new RecordingQueryTimingSink({ now: () => clockValues.shift() ?? 17 });
    const span = sink.start("planning", { query: "handler", retry: false });
    span.end({ candidateCount: 4 });
    span.end({ candidateCount: 99 });

    expect(sink.events()).toEqual([
      {
        stage: "planning",
        durationMs: 7,
        attributes: { query: "handler", retry: false, candidateCount: 4 }
      }
    ]);
  });

  it("measures sync and async work and marks failures", async () => {
    let now = 100;
    const sink = new RecordingQueryTimingSink({ now: () => now++ });

    expect(measureQueryTiming(sink, "snapshot", () => "ready")).toBe("ready");
    await expect(measureQueryTiming(sink, "source", async () => "loaded")).resolves.toBe("loaded");
    await expect(
      measureQueryTiming(sink, "context", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(sink.events()).toEqual([
      { stage: "snapshot", durationMs: 1 },
      { stage: "source", durationMs: 1 },
      { stage: "context", durationMs: 1, attributes: { error: true } }
    ]);
  });
});
