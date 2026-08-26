import { describe, expect, it } from "vitest";

import { validateDisposableMarkdownProject } from "../../../benchmarks/markdown/lifecycle.mjs";

describe("Markdown lifecycle harness", () => {
  it("requires a bounded indexed markdown-v0449 disposable project", () => {
    expect(() => validateDisposableMarkdownProject("C:/tmp/markdown-v0449-fixture", "../outside.md")).toThrow();
    expect(() => validateDisposableMarkdownProject("C:/tmp/not-markdown", "probe.md")).toThrow();
  });
});
