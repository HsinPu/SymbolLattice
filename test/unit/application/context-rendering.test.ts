import { describe, expect, it } from "vitest";

import {
  INVESTIGATION_SOURCE_RENDER_POLICY,
  renderInvestigationDeclaration
} from "../../../src/application/context-rendering.js";

const declarationRange = {
  start: { line: 10, column: 1 },
  end: { line: 17, column: 1 }
} as const;

describe("evidence-preserving investigation source rendering", () => {
  it("returns the complete persisted declaration when it fits", () => {
    const sourceText = "export function answer(): number { return 42; }";
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: sourceText.length,
      declarationRange: {
        start: { line: 3, column: 1 },
        end: { line: 3, column: sourceText.length + 1 }
      },
      lexicalFocusRange: { start: { line: 3, column: 17 }, end: { line: 3, column: 23 } },
      language: "typescript",
      requestedMode: "adaptive",
      filePath: "src/answer.ts",
      declarationReference: "answer"
    });

    expect(result.text).toBe(sourceText);
    expect(result.receipt).toMatchObject({
      policy: INVESTIGATION_SOURCE_RENDER_POLICY,
      requestedMode: "adaptive",
      mode: "full",
      complete: true,
      contiguous: true,
      emittedCharacters: sourceText.length,
      omittedCharactersBefore: 0,
      omittedCharactersAfter: 0,
      focus: { available: true, included: true, fallbackReason: null }
    });
    expect(result.renderedRange).toEqual({
      start: { line: 3, column: 1 },
      end: { line: 3, column: sourceText.length + 1 }
    });
  });

  it("centers an adaptive focused slice on the persisted lexical hit", () => {
    const sourceText = [
      "export function compute(): string {",
      "  const before = \"before\";",
      "  const more = \"more\";",
      "  const target = \"needleEvidence\";",
      "  const after = \"after\";",
      "  return target;",
      "}"
    ].join("\n");
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: 80,
      declarationRange,
      lexicalFocusRange: { start: { line: 13, column: 19 }, end: { line: 13, column: 33 } },
      language: "typescript",
      requestedMode: "adaptive",
      filePath: "src/compute.ts",
      declarationReference: "compute"
    });

    expect(result.receipt).toMatchObject({
      mode: "focused",
      complete: false,
      contiguous: true,
      lineAligned: true,
      focus: { available: true, included: true, fallbackReason: null }
    });
    expect(result.text).toContain("needleEvidence");
    expect(result.text.length).toBeLessThanOrEqual(80);
    expect(result.receipt.omittedCharactersBefore).toBeGreaterThan(0);
    expect(result.receipt.omittedCharactersAfter).toBeGreaterThan(0);
    expect(sourceText.slice(
      result.receipt.sourceCharacterOffsets.start,
      result.receipt.sourceCharacterOffsets.end
    )).toBe(result.text);
  });

  it("renders signature and lexical focus as separately verifiable source segments", () => {
    const sourceText = [
      "export function compute(value: string): string {",
      ...Array.from({ length: 16 }, (_value, index) => `  const padding${index} = value;`),
      '  const answer = "needleEvidence";',
      "  return answer;",
      "}"
    ].join("\n");
    const input = {
      sourceText,
      allocatedCharacters: 120,
      declarationRange: {
        start: { line: 30, column: 1 },
        end: { line: 49, column: 2 }
      },
      lexicalFocusRange: { start: { line: 47, column: 19 }, end: { line: 47, column: 33 } },
      language: "typescript" as const,
      requestedMode: "multi" as const,
      filePath: "src/compute.ts",
      declarationReference: "compute"
    };

    const first = renderInvestigationDeclaration(input);
    const second = renderInvestigationDeclaration(input);

    expect(first.receipt).toMatchObject({
      requestedMode: "multi",
      mode: "multi",
      complete: false,
      contiguous: false,
      emittedCharacters: first.segments.reduce((total, segment) => total + segment.text.length, 0),
      primarySegmentId: first.segments[1]?.id,
      multi: {
        requested: true,
        emitted: true,
        maximumSegments: 2,
        fallbackReason: null
      },
      navigation: {
        synthesizedText: null
      }
    });
    expect(first.segments).toHaveLength(2);
    expect(first.segments.map((segment) => segment.roles)).toEqual([
      ["signature"],
      ["focus"]
    ]);
    expect(first.text).toBe(first.segments[1]?.text);
    expect(first.segments[1]?.text).toContain("needleEvidence");
    expect(first.receipt.navigation.gaps).toHaveLength(1);
    expect(first.receipt.navigation.gaps[0]).toMatchObject({
      fromSegmentId: first.segments[0]?.id,
      toSegmentId: first.segments[1]?.id
    });
    expect(first.receipt.navigation.gaps[0]?.omittedCharacters).toBeGreaterThan(0);
    expect(first.segments.map((segment) => segment.id)).toEqual(
      second.segments.map((segment) => segment.id)
    );
    for (const segment of first.segments) {
      expect(segment.contiguous).toBe(true);
      expect(sourceText.slice(
        segment.sourceCharacterOffsets.start,
        segment.sourceCharacterOffsets.end
      )).toBe(segment.text);
      expect(segment.contentSha256).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("changes segment identity when the persisted source bytes change", () => {
    const base = {
      allocatedCharacters: 90,
      declarationRange: {
        start: { line: 1, column: 1 },
        end: { line: 8, column: 2 }
      },
      lexicalFocusRange: { start: { line: 7, column: 11 }, end: { line: 7, column: 17 } },
      language: "typescript" as const,
      requestedMode: "multi" as const,
      filePath: "src/value.ts",
      declarationReference: "value"
    };
    const original = renderInvestigationDeclaration({
      ...base,
      sourceText: [
        "export function value(): string {",
        "  const a = 1;",
        "  const b = 2;",
        "  const c = 3;",
        "  const d = 4;",
        "  const e = 5;",
        '  return "needle";',
        "}"
      ].join("\n")
    });
    const edited = renderInvestigationDeclaration({
      ...base,
      sourceText: [
        "export function value(): string {",
        "  const a = 1;",
        "  const b = 2;",
        "  const c = 3;",
        "  const d = 4;",
        "  const e = 5;",
        '  return "needlf";',
        "}"
      ].join("\n")
    });

    expect(original.segments.map((segment) => segment.id)).not.toEqual(
      edited.segments.map((segment) => segment.id)
    );
  });

  it("falls back to one exact focus segment when both proofs exceed the allocation", () => {
    const sourceText = [
      "export function compute(value: string): string {",
      ...Array.from({ length: 10 }, (_value, index) => `  const padding${index} = value;`),
      '  return "needleEvidence";',
      "}"
    ].join("\n");
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: 55,
      declarationRange: {
        start: { line: 1, column: 1 },
        end: { line: 13, column: 2 }
      },
      lexicalFocusRange: { start: { line: 12, column: 11 }, end: { line: 12, column: 25 } },
      language: "typescript",
      requestedMode: "multi",
      filePath: "src/compute.ts",
      declarationReference: "compute"
    });

    expect(result.segments).toHaveLength(1);
    expect(result.text).toContain("needleEvidence");
    expect(result.receipt).toMatchObject({
      mode: "focused",
      contiguous: true,
      segmentCount: 1,
      multi: {
        requested: true,
        emitted: false,
        maximumSegments: 2,
        fallbackReason: "multi-evidence-exceeds-allocation"
      },
      navigation: { synthesizedText: null, gaps: [] }
    });
  });

  it("falls back to one exact focus segment when the language has no proven signature", () => {
    const sourceText = "first line\nneedleEvidence\nlast line";
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: 24,
      declarationRange: {
        start: { line: 1, column: 1 },
        end: { line: 3, column: 10 }
      },
      lexicalFocusRange: { start: { line: 2, column: 1 }, end: { line: 2, column: 15 } },
      language: "properties",
      requestedMode: "multi",
      filePath: "config/example.properties",
      declarationReference: "example"
    });

    expect(result.segments).toHaveLength(1);
    expect(result.text).toContain("needleEvidence");
    expect(result.receipt.multi).toEqual({
      requested: true,
      emitted: false,
      maximumSegments: 2,
      fallbackReason: "multi-signature-unavailable"
    });
    expect(result.receipt.signature).toMatchObject({
      proven: false,
      fallbackReason: "language-signature-boundary-unsupported"
    });
  });

  it("extracts a proven brace-language signature without trusting braces in literals", () => {
    const sourceText = [
      "export function compute(",
      "  input: string = \"literal { brace\"",
      "): string {",
      "  return input;",
      "}"
    ].join("\n");
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: 512,
      declarationRange: {
        start: { line: 20, column: 1 },
        end: { line: 24, column: 2 }
      },
      lexicalFocusRange: null,
      language: "typescript",
      requestedMode: "signature",
      filePath: "src/compute.ts",
      declarationReference: "compute"
    });

    expect(result.text).toBe([
      "export function compute(",
      "  input: string = \"literal { brace\"",
      "): string"
    ].join("\n"));
    expect(result.receipt).toMatchObject({
      requestedMode: "signature",
      mode: "signature",
      signature: { strategy: "brace-header", proven: true, fallbackReason: null },
      complete: false
    });
  });

  it("does not mistake an object return type for a proven body boundary", () => {
    const sourceText = [
      "export function objectResult(): { answer: string } {",
      '  return { answer: "ok" };',
      "}"
    ].join("\n");
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: 512,
      declarationRange: {
        start: { line: 1, column: 1 },
        end: { line: 3, column: 2 }
      },
      lexicalFocusRange: null,
      language: "typescript",
      requestedMode: "signature",
      filePath: "src/object-result.ts",
      declarationReference: "objectResult"
    });

    expect(result.receipt).toMatchObject({
      mode: "prefix",
      signature: {
        strategy: "brace-header",
        proven: false,
        fallbackReason: "signature-boundary-not-found"
      }
    });
  });

  it("reports the actual end of a complete bounded prefix instead of the wider declaration end", () => {
    const result = renderInvestigationDeclaration({
      sourceText: "line one\nline two",
      allocatedCharacters: 100,
      declarationRange: {
        start: { line: 40, column: 3 },
        end: { line: 99, column: 1 }
      },
      lexicalFocusRange: null,
      language: "properties",
      requestedMode: "adaptive",
      filePath: "config/example.properties",
      declarationReference: "example"
    });

    expect(result.renderedRange).toEqual({
      start: { line: 40, column: 3 },
      end: { line: 41, column: 9 }
    });
  });

  it("extracts a multiline Python signature at the proven header colon", () => {
    const sourceText = [
      "def compute(",
      "    value: dict[str, str],",
      ") -> str:",
      "    return value[\"answer\"]"
    ].join("\n");
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: 512,
      declarationRange: {
        start: { line: 4, column: 1 },
        end: { line: 7, column: 27 }
      },
      lexicalFocusRange: null,
      language: "python",
      requestedMode: "signature",
      filePath: "src/compute.py",
      declarationReference: "compute"
    });

    expect(result.text).toBe([
      "def compute(",
      "    value: dict[str, str],",
      ") -> str:"
    ].join("\n"));
    expect(result.receipt.signature).toMatchObject({
      strategy: "python-header",
      proven: true,
      fallbackReason: null
    });
  });

  it("fails closed to a bounded prefix when focus and signature proof are unavailable", () => {
    const sourceText = "alpha\nbeta\ngamma\ndelta";
    const result = renderInvestigationDeclaration({
      sourceText,
      allocatedCharacters: 10,
      declarationRange: {
        start: { line: 1, column: 1 },
        end: { line: 4, column: 6 }
      },
      lexicalFocusRange: { start: { line: 20, column: 1 }, end: { line: 20, column: 2 } },
      language: "properties",
      requestedMode: "adaptive",
      filePath: "config/example.properties",
      declarationReference: "example"
    });

    expect(result.text).toBe(sourceText.slice(0, 10));
    expect(result.receipt).toMatchObject({
      mode: "prefix",
      focus: {
        available: false,
        included: false,
        fallbackReason: "focus-outside-bounded-declaration"
      },
      signature: {
        strategy: null,
        proven: false,
        fallbackReason: "language-signature-boundary-unsupported"
      }
    });
  });

  it("rejects unsafe allocations and malformed declaration ranges", () => {
    expect(() => renderInvestigationDeclaration({
      sourceText: "function x() {}",
      allocatedCharacters: -1,
      declarationRange,
      lexicalFocusRange: null,
      language: "typescript",
      requestedMode: "adaptive",
      filePath: "src/x.ts",
      declarationReference: "x"
    })).toThrow(/allocated characters/u);
    expect(() => renderInvestigationDeclaration({
      sourceText: "function x() {}",
      allocatedCharacters: 5,
      declarationRange: { start: { line: 0, column: 1 }, end: { line: 1, column: 1 } },
      lexicalFocusRange: null,
      language: "typescript",
      requestedMode: "adaptive",
      filePath: "src/x.ts",
      declarationReference: "x"
    })).toThrow(/declaration range/u);
  });
});
