import { describe, expect, it } from "vitest";

import { extractShellFileFacts } from "../../../src/extraction/shell.js";
import type { ShellParser } from "../../../src/extraction/shell-wasm-runtime.js";

describe("Shell relation facts v0.503", () => {
  it("projects one parser-proven singleton direct function call", () => {
    const sourceText = "callee() { :; }\ncaller() { callee value; }\n";
    const bytes = new TextEncoder().encode(sourceText);
    const offset = (text: string, from = 0) => sourceText.indexOf(text, from);
    const parser = (() => ({
      ok: true as const,
      functions: [
        { name: "callee", form: "posix-parens" as const, declStart: 0, declEnd: 15, nameStart: 0, nameEnd: 6, bodyStart: 9, bodyEnd: 15 },
        { name: "caller", form: "posix-parens" as const, declStart: 16, declEnd: bytes.length - 1, nameStart: 16, nameEnd: 22, bodyStart: 25, bodyEnd: bytes.length - 1 }
      ],
      calls: [{
        sourceFunctionIndex: 1,
        targetFunctionIndex: 0,
        name: "callee",
        start: offset("callee", 22),
        end: offset("callee", 22) + 6,
        candidateFunctionIndexes: [0],
        parserProvenance: "mvdan.cc/sh/v3@v3.13.1.CallExpr.literal-command"
      }]
    })) as unknown as ShellParser;
    const facts = extractShellFileFacts({ filePath: "script.sh", language: "shell", sourceText }, parser);
    const caller = facts.symbols.find((symbol) => symbol.name === "caller");
    const callee = facts.symbols.find((symbol) => symbol.name === "callee");
    expect(facts.edges).toContainEqual(expect.objectContaining({
      sourceId: caller?.id,
      targetId: callee?.id,
      kind: "calls",
      resolution: "exact",
      confidence: 1,
      referenceName: "callee",
      evidence: {
        ruleId: "language.shell.call.direct-top-level-function.singleton-parser-proof",
        stage: "syntax",
        candidateSymbolIds: [callee?.id]
      }
    }));
  });

  it("uses the retained ABI v2 parser and fails closed for dynamic command-table hazards", () => {
    const direct = extractShellFileFacts({
      filePath: "direct.sh",
      language: "shell",
      sourceText: "callee() { :; }\ncaller() { callee value; }\n"
    });
    expect(direct.edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({ referenceName: "callee", resolution: "exact", confidence: 1 })
    ]);

    for (const sourceText of [
      "callee() { :; }\ncaller() { eval 'callee'; callee; }\n",
      "callee() { :; }\ncaller() { source ./other.sh; callee; }\n",
      "callee() { :; }\ncallee() { :; }\ncaller() { callee; }\n",
      "callee() { :; }\ncaller() { nested() { :; }; callee; }\n",
      "callee() { :; }\ncaller() { echo $(callee); }\n"
    ]) {
      const facts = extractShellFileFacts({ filePath: "unsafe.sh", language: "shell", sourceText });
      expect(facts.edges.filter((edge) => edge.kind === "calls")).toEqual([]);
    }
  });
});
