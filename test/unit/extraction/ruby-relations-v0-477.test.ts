import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

function facts(sourceText: string, filePath = "src/app.rb") {
  return extractFileFacts({ filePath, language: "ruby", sourceText });
}

describe("Ruby relation facts v0.477", () => {
  it("retains literal require_relative, class inheritance, and constant singleton calls", () => {
    const result = facts([
      'require_relative "./parent"',
      "class Child < Parent",
      "  def run(value)",
      "    Parent.ping(value)",
      "  end",
      "end"
    ].join("\n"));
    expect(result.rubyFacts).toMatchObject({
      parserRejected: false,
      imports: [expect.objectContaining({ importedPath: "./parent" })],
      heritage: [expect.objectContaining({ sourceTypePath: "Child", targetTypePath: "Parent" })],
      calls: [expect.objectContaining({ receiverTypePath: "Parent", referenceName: "ping", argumentCount: 1 })]
    });
  });

  it("marks constant reassignment and runtime method-table mutation unsafe", () => {
    const reassigned = facts([
      "module Parent",
      "  def self.ping; end",
      "end",
      "Parent = Other"
    ].join("\n"));
    expect(reassigned.rubyFacts?.unsafeDynamicFeatures).toBe(true);

    const mutated = facts([
      "module Parent",
      "  include RuntimeMixin",
      "  def self.ping; end",
      "end"
    ].join("\n"));
    expect(mutated.rubyFacts?.unsafeDynamicFeatures).toBe(true);
  });

  it("keeps plain require, dynamic receiver calls, and malformed source as nonclaims", () => {
    const dynamic = facts([
      'require "parent"',
      "class Caller",
      "  def run(value)",
      "    value.run",
      "  end",
      "end"
    ].join("\n"));
    expect(dynamic.rubyFacts?.imports).toEqual([]);
    expect(dynamic.rubyFacts?.calls).toEqual([]);

    const malformed = facts("class Broken < Parent\n  def run\n");
    expect(malformed.rubyFacts?.parserRejected).toBe(true);
    expect(malformed.rubyFacts?.types).toEqual([]);
  });
});
