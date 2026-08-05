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
      requestedMode: "adaptive"
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
      requestedMode: "adaptive"
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
      requestedMode: "signature"
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
      requestedMode: "signature"
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
      requestedMode: "adaptive"
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
      requestedMode: "signature"
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
      requestedMode: "adaptive"
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
      requestedMode: "adaptive"
    })).toThrow(/allocated characters/u);
    expect(() => renderInvestigationDeclaration({
      sourceText: "function x() {}",
      allocatedCharacters: 5,
      declarationRange: { start: { line: 0, column: 1 }, end: { line: 1, column: 1 } },
      lexicalFocusRange: null,
      language: "typescript",
      requestedMode: "adaptive"
    })).toThrow(/declaration range/u);
  });
});
