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

  it("fails closed for external-unit calls in every mapped uppercase Fortran extension", () => {
    const fixedFormExtensions = new Set(["F", "FOR", "F77"]);
    for (const extension of ["F", "FOR", "F77", "F90", "F95", "F03", "F08", "F18"]) {
      const fixedForm = fixedFormExtensions.has(extension);
      const indent = fixedForm ? "      " : "";
      const facts = extractFortranFileFacts({
        filePath: `src/probe.${extension}`,
        language: "fortran",
        sourceText: `${indent}subroutine fortranEntry()
${indent}call fortranHelper()
${indent}end subroutine fortranEntry
${indent}subroutine fortranHelper()
${indent}end subroutine fortranHelper`
      });

      expect(
        facts.symbols.filter((symbol) => symbol.kind === "function"),
        extension
      ).toHaveLength(2);
      expect(calls(facts), extension).toEqual([]);
    }
  });

  it("fails closed for preprocessed lowercase external-unit calls", () => {
    const directives = [
      ["macro target replacement", "#define fortranHelper foreignHelper"],
      ["included source", '#include "generated-target.inc"'],
      ["undefined target", "#undef fortranHelper"],
      ["unmatched alternate", "#else"]
    ] as const;
    for (const [description, directive] of directives) {
      const facts = extractFortranFileFacts({
        filePath: "src/probe.f90",
        language: "fortran",
        sourceText: `${directive}
subroutine fortranEntry()
  call fortranHelper()
end subroutine fortranEntry
subroutine FORTRANHELPER()
end subroutine FORTRANHELPER`
      });

      expect(facts.symbols.filter((symbol) => symbol.kind === "function"), description).toHaveLength(
        2
      );
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("fails closed when a balanced conditional wraps an external call endpoint", () => {
    const sources = [
      [
        "conditional target",
        `subroutine fortranEntry()
  call fortranHelper()
end subroutine fortranEntry
#if WITH_HELPER
subroutine fortranHelper()
end subroutine fortranHelper
#endif`
      ],
      [
        "conditional caller",
        `#if WITH_ENTRY
subroutine fortranEntry()
  call fortranHelper()
end subroutine fortranEntry
#endif
subroutine fortranHelper()
end subroutine fortranHelper`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractFortranFileFacts({
        filePath: "src/probe.f90",
        language: "fortran",
        sourceText
      });

      expect(facts.symbols.filter((symbol) => symbol.kind === "function"), description).toHaveLength(
        2
      );
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("retains an external-unit exact call beside an unrelated balanced conditional", () => {
    const facts = extractFortranFileFacts({
      filePath: "src/probe.f90",
      language: "fortran",
      sourceText: `#if WITH_FLAG
#define UNUSED_FLAG 1
#endif
subroutine fortranEntry()
  call fortranHelper()
end subroutine fortranEntry
subroutine fortranHelper()
end subroutine fortranHelper`
    });

    expect(calls(facts)).toHaveLength(1);
  });

  it("emits module-qualified contained Fortran procedures and an argumented same-module call", () => {
    const facts = extractFortranFileFacts({
      filePath: "src/testdrive.f90",
      language: "fortran",
      sourceText: `module testdrive
  use support, only: imported_name
  implicit none
  type :: testcase
  contains
    procedure :: execute
  end type testcase
contains
  pure subroutine run_unittest(test)
    type(testcase), intent(in) :: test
    call make_output(test)
  end subroutine run_unittest

  pure subroutine make_output(test)
    type(testcase), intent(in) :: test
  end subroutine make_output
end module testdrive`
    });
    const module = facts.symbols.find(
      (symbol) => symbol.kind === "module" && symbol.name === "testdrive"
    );
    const caller = facts.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "testdrive::run_unittest"
    );
    const callee = facts.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "testdrive::make_output"
    );

    expect(module).toBeDefined();
    expect(caller).toBeDefined();
    expect(callee).toBeDefined();
    if (caller === undefined || callee === undefined) {
      throw new Error("Missing module-contained Fortran procedures.");
    }
    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        range: {
          start: { line: 11, column: 10 },
          end: { line: 11, column: 21 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "make_output",
        evidence: {
          ruleId: "syntax.fortran.same-module.unique-contained-subroutine-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for module-contained calls in preprocessing-prone uppercase Fortran files", () => {
    const facts = extractFortranFileFacts({
      filePath: "src/probe.F90",
      language: "fortran",
      sourceText: `module probe
contains
  subroutine run_probe()
    call make_output()
  end subroutine run_probe
  subroutine MAKE_OUTPUT()
  end subroutine MAKE_OUTPUT
end module probe`
    });

    expect(
      facts.symbols.filter(
        (symbol) =>
          symbol.qualifiedName === "probe::run_probe" ||
          symbol.qualifiedName === "probe::MAKE_OUTPUT"
      )
    ).toHaveLength(2);
    expect(calls(facts)).toEqual([]);
  });

  it("fails closed for ambiguous module-contained Fortran calls", () => {
    const sources = [
      [
        "type-bound call",
        `module testdrive
contains
  subroutine run_unittest(test)
    type(testcase), intent(in) :: test
    call test%make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "procedure dummy",
        `module testdrive
contains
  subroutine run_unittest(make_output)
    procedure() :: make_output
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "imported collision",
        `module testdrive
  use support, only: make_output
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "generic interface",
        `module testdrive
  interface make_output
    module procedure make_output_impl
  end interface make_output
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "duplicate member",
        `module testdrive
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
  subroutine make_output()
end subroutine make_output
end module testdrive`
      ],
      [
        "unnamed caller interface",
        `module testdrive
contains
  subroutine run_unittest()
    interface
      subroutine make_output()
      end subroutine make_output
    end interface
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "macro target replacement",
        `#define make_output external_output
module testdrive
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
end subroutine make_output
end module testdrive`
      ],
      [
        "macro procedure binding token",
        `#if WITH_SHADOW
#define SHADOW procedure
#endif
module testdrive
contains
  subroutine run_unittest()
    SHADOW() :: make_output
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "macro call keyword token",
        `#if WITH_CALL
#define call invoke
#endif
module testdrive
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "included source",
        `#include "generated-target.inc"
module testdrive
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "unmatched alternate directive",
        `module testdrive
#else
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ],
      [
        "conditional duplicate member",
        `module testdrive
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
#if WITH_OUTPUT
  subroutine make_output()
  end subroutine make_output
#else
  subroutine make_output()
  end subroutine make_output
#endif
end module testdrive`
      ],
      [
        "multiple modules in one file",
        `module testdrive
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive
module another_module
end module another_module`
      ],
      [
        "inner type contains",
        `module testdrive
  type :: testcase
  contains
    procedure :: make_output
  end type testcase
contains
  subroutine run_unittest()
    call make_output()
  end subroutine run_unittest
  subroutine make_output()
  end subroutine make_output
end module testdrive`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractFortranFileFacts({
        filePath: "src/testdrive.f90",
        language: "fortran",
        sourceText
      });
      expect(calls(facts), description).toEqual([]);
    }
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
