import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractAdaFileFacts } from "../../../src/extraction/ada.js";
import { extractFortranFileFacts } from "../../../src/extraction/fortran.js";
import { extractZigFileFacts } from "../../../src/extraction/zig.js";

function functionByName(facts: ArtifactFacts, name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === "function" && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing function ${name}.`);
  }
  return symbol;
}

function calls(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "calls");
}

describe("Fortran, Ada, and Zig bounded same-file direct calls", () => {
  it("emits one exact Fortran zero-argument subroutine call with unique target evidence", () => {
    const facts = extractFortranFileFacts({
      filePath: "src/smoke.f90",
      language: "fortran",
      sourceText: `subroutine fortranEntry()
  call fortranHelper()
end subroutine fortranEntry

subroutine fortranHelper()
end subroutine fortranHelper`
    });
    const caller = functionByName(facts, "fortranEntry");
    const callee = functionByName(facts, "fortranHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        filePath: "src/smoke.f90",
        range: {
          start: { line: 2, column: 8 },
          end: { line: 2, column: 21 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "fortranHelper",
        evidence: {
          ruleId: "syntax.fortran.same-file.unique-zero-argument-subroutine-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("emits one exact Ada zero-argument procedure call with unique target evidence", () => {
    const facts = extractAdaFileFacts({
      filePath: "src/smoke.adb",
      language: "ada",
      sourceText: `with adaHelper;
procedure adaEntry is
begin
  adaHelper;
end adaEntry;

procedure adaHelper is
begin
  null;
end adaHelper;`
    });
    const caller = functionByName(facts, "adaEntry");
    const callee = functionByName(facts, "adaHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        filePath: "src/smoke.adb",
        range: {
          start: { line: 4, column: 3 },
          end: { line: 4, column: 12 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "adaHelper",
        evidence: {
          ruleId: "syntax.ada.same-file.unique-zero-argument-procedure-call.direct-context-with",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("emits one exact Zig zero-argument top-level function call with unique target evidence", () => {
    const facts = extractZigFileFacts({
      filePath: "src/smoke.zig",
      language: "zig",
      sourceText: `fn zigEntry() void { zigHelper(); }
fn zigHelper() void {}`
    });
    const caller = functionByName(facts, "zigEntry");
    const callee = functionByName(facts, "zigHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        filePath: "src/smoke.zig",
        range: {
          start: { line: 1, column: 22 },
          end: { line: 1, column: 31 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "zigHelper",
        evidence: {
          ruleId: "syntax.zig.same-file.unique-zero-argument-top-level-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for Fortran shadowing, duplicate targets, and non-bare calls", () => {
    const sources = [
      [
        "dummy argument shadow",
        `subroutine fortranEntry(fortranHelper)
  call fortranHelper()
end subroutine fortranEntry
subroutine fortranHelper()
end subroutine fortranHelper`
      ],
      [
        "external procedure",
        `subroutine fortranEntry()
  external fortranHelper
  call fortranHelper()
end subroutine fortranEntry
subroutine fortranHelper()
end subroutine fortranHelper`
      ],
      [
        "module use",
        `subroutine fortranEntry()
  use foreign
  call fortranHelper()
end subroutine fortranEntry
subroutine fortranHelper()
end subroutine fortranHelper`
      ],
      [
        "qualified call",
        `subroutine fortranEntry()
  call holder%fortranHelper()
end subroutine fortranEntry
subroutine fortranHelper()
end subroutine fortranHelper`
      ],
      [
        "duplicate target",
        `subroutine fortranEntry()
  call fortranHelper()
end subroutine fortranEntry
subroutine fortranHelper()
end subroutine fortranHelper
subroutine fortranHelper()
end subroutine fortranHelper`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractFortranFileFacts({
        filePath: "src/smoke.f90",
        language: "fortran",
        sourceText
      });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("fails closed when a Fortran call name is a standard intrinsic subroutine", () => {
    const facts = extractFortranFileFacts({
      filePath: "src/smoke.f90",
      language: "fortran",
      sourceText: `subroutine fortranEntry()
  call random_seed()
end subroutine fortranEntry

subroutine random_seed()
end subroutine random_seed`
    });

    expect(calls(facts)).toEqual([]);
  });

  it("fails closed for Ada shadowing, duplicate targets, and non-bare calls", () => {
    const sources = [
      [
        "parameter shadow",
        `procedure adaEntry(adaHelper : access procedure) is
begin
  adaHelper;
end adaEntry;
procedure adaHelper is
begin
  null;
end adaHelper;`
      ],
      [
        "local subprogram value",
        `procedure adaEntry is
  adaHelper : Integer := 0;
begin
  adaHelper;
end adaEntry;
procedure adaHelper is
begin
  null;
end adaHelper;`
      ],
      [
        "use clause",
        `with Foreign;
use Foreign;
procedure adaEntry is
begin
  adaHelper;
end adaEntry;
procedure adaHelper is
begin
  null;
end adaHelper;`
      ],
      [
        "qualified call",
        `procedure adaEntry is
begin
  Foreign.adaHelper;
end adaEntry;
procedure adaHelper is
begin
  null;
end adaHelper;`
      ],
      [
        "duplicate target",
        `procedure adaEntry is
begin
  adaHelper;
end adaEntry;
procedure adaHelper is
begin
  null;
end adaHelper;
procedure adaHelper is
begin
  null;
end adaHelper;`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractAdaFileFacts({ filePath: "src/smoke.adb", language: "ada", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("does not infer Ada library-unit visibility from physical same-file placement", () => {
    const facts = extractAdaFileFacts({
      filePath: "src/smoke.adb",
      language: "ada",
      sourceText: `procedure Parent.adaEntry is
begin
  adaHelper;
end Parent.adaEntry;

procedure adaHelper is
begin
  null;
end adaHelper;`
    });

    expect(calls(facts)).toEqual([]);
  });

  it("fails closed for an unqualified Ada call from a child library unit even with context", () => {
    const facts = extractAdaFileFacts({
      filePath: "src/smoke.adb",
      language: "ada",
      sourceText: `with adaHelper;
procedure Parent.adaEntry is
begin
  adaHelper;
end Parent.adaEntry;

procedure adaHelper is
begin
  null;
end adaHelper;`
    });

    expect(calls(facts)).toEqual([]);
  });

  it("fails closed for Zig shadowing, imports, duplicate targets, and qualified calls", () => {
    const sources = [
      [
        "local binding",
        `fn zigEntry() void { const zigHelper = callback; zigHelper(); }
fn zigHelper() void {}`
      ],
      [
        "qualified call",
        `fn zigEntry() void { foreign.zigHelper(); }
fn zigHelper() void {}`
      ],
      [
        "import competition",
        `const foreign = @import("foreign.zig");
fn zigEntry() void { zigHelper(); }
fn zigHelper() void {}`
      ],
      [
        "duplicate target",
        `fn zigEntry() void { zigHelper(); }
fn zigHelper() void {}
fn zigHelper(value: u8) void { _ = value; }`
      ],
      [
        "dynamic function pointer",
        `fn zigEntry() void { const zigHelper = callback; zigHelper(); }
fn zigHelper() void {}`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractZigFileFacts({ filePath: "src/smoke.zig", language: "zig", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
