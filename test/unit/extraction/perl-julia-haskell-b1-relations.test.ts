import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractHaskellFileFacts } from "../../../src/extraction/haskell.js";
import { extractJuliaFileFacts } from "../../../src/extraction/julia.js";
import { extractPerlFileFacts } from "../../../src/extraction/perl.js";

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

function exactRoutes(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact");
}

describe("Perl, Julia, and Haskell B1 exact relations", () => {
  it("keeps Perl package-local literal Dancer2 coderefs as exact routes without claiming bare sub calls", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/Smoke.pm",
      language: "perl",
      sourceText: `package Smoke;
use Dancer2;

sub perlHandler { return "ok"; }
sub perlEntry { perlHandler(); }

get "/smoke" => \\&perlHandler;`
    });
    const handler = functionByName(facts, "perlHandler");

    expect(calls(facts)).toEqual([]);
    expect(exactRoutes(facts)).toEqual([
      expect.objectContaining({
        targetId: handler.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "Smoke::perlHandler",
        evidence: {
          ruleId: "framework.dancer2.direct-route.literal-verb.local-sub",
          stage: "syntax",
          candidateSymbolIds: [handler.id]
        }
      })
    ]);
  });

  it("emits exact Julia and Haskell same-file unique zero-argument bare calls", () => {
    const juliaFacts = extractJuliaFileFacts({
      filePath: "src/Smoke.jl",
      language: "julia",
      sourceText: `juliaHelper() = 1
juliaEntry() = juliaHelper()`
    });
    const juliaCaller = functionByName(juliaFacts, "juliaEntry");
    const juliaCallee = functionByName(juliaFacts, "juliaHelper");

    expect(calls(juliaFacts)).toEqual([
      expect.objectContaining({
        sourceId: juliaCaller.id,
        targetId: juliaCallee.id,
        filePath: "src/Smoke.jl",
        range: {
          start: { line: 2, column: 16 },
          end: { line: 2, column: 27 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "juliaHelper",
        evidence: {
          ruleId: "syntax.julia.same-file.unique-zero-argument-bare-function-call",
          stage: "syntax",
          candidateSymbolIds: [juliaCallee.id]
        }
      })
    ]);

    const haskellFacts = extractHaskellFileFacts({
      filePath: "src/Smoke.hs",
      language: "haskell",
      sourceText: `haskellHelper () = 1
haskellEntry () = haskellHelper ()`
    });
    const haskellCaller = functionByName(haskellFacts, "haskellEntry");
    const haskellCallee = functionByName(haskellFacts, "haskellHelper");

    expect(calls(haskellFacts)).toEqual([
      expect.objectContaining({
        sourceId: haskellCaller.id,
        targetId: haskellCallee.id,
        filePath: "src/Smoke.hs",
        range: {
          start: { line: 2, column: 19 },
          end: { line: 2, column: 32 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "haskellHelper",
        evidence: {
          ruleId: "syntax.haskell.same-file.unique-unit-argument-bare-function-call",
          stage: "syntax",
          candidateSymbolIds: [haskellCallee.id]
        }
      })
    ]);
  });

  it("fails closed for Perl imports, dynamic evaluation, and typeglob rebinding", () => {
    const sources = [
      ["foreign import", `package Smoke;\nuse Dancer2;\nuse Foreign;\nsub perlHandler {}\nget "/smoke" => \\&perlHandler;`],
      ["foreign import list", `package Smoke;\nuse Dancer2;\nuse Foreign qw(perlHandler);\nsub perlHandler {}\nget "/smoke" => \\&perlHandler;`],
      ["eval", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\neval "1";\nget "/smoke" => \\&perlHandler;`],
      ["evalbytes", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\nevalbytes "1";\nget "/smoke" => \\&perlHandler;`],
      ["do file", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\ndo "./foreign.pl";\nget "/smoke" => \\&perlHandler;`],
      ["require", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\nrequire Foreign;\nget "/smoke" => \\&perlHandler;`],
      ["typeglob rebinding", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\n*perlHandler = sub {};\nget "/smoke" => \\&perlHandler;`],
      ["undef sub", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\nundef &perlHandler;\nget "/smoke" => \\&perlHandler;`],
      ["undef typeglob", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\nundef *perlHandler;\nget "/smoke" => \\&perlHandler;`],
      ["compile-time body mutation", `package Smoke;\nuse Dancer2;\nsub perlHandler {\n  BEGIN { *perlHandler = sub {}; }\n  return "ok";\n}\nget "/smoke" => \\&perlHandler;`],
      ["dynamic body evaluation", `package Smoke;\nuse Dancer2;\nsub perlHandler { evalbytes "1"; return "ok"; }\nget "/smoke" => \\&perlHandler;`],
      ["body symbol undef", `package Smoke;\nuse Dancer2;\nsub perlHandler { undef *perlHandler; return "ok"; }\nget "/smoke" => \\&perlHandler;`],
      ["unknown top-level statement", `package Smoke;\nuse Dancer2;\nsub perlHandler {}\n$unknown = 1;\nget "/smoke" => \\&perlHandler;`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractPerlFileFacts({ filePath: "lib/Smoke.pm", language: "perl", sourceText });
      expect(exactRoutes(facts), description).toEqual([]);
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("fails closed for Julia imports, multimethods, macros, rebinding, arity, closures, and qualified calls", () => {
    const sources = [
      ["import", `using Foreign\njuliaHelper() = 1\njuliaEntry() = juliaHelper()`],
      ["multimethod", `juliaHelper() = 1\njuliaHelper(value) = value\njuliaEntry() = juliaHelper()`],
      ["full-form redefinition", `juliaHelper() = 1\nfunction juliaHelper()\n  2\nend\njuliaEntry() = juliaHelper()`],
      ["begin redefinition", `juliaHelper() = 1\nbegin\n  juliaHelper() = 2\nend\njuliaEntry() = juliaHelper()`],
      ["if redefinition", `juliaHelper() = 1\nif true\n  juliaHelper() = 2\nend\njuliaEntry() = juliaHelper()`],
      ["Main qualified full-form redefinition", `juliaHelper() = 1\nfunction Main.juliaHelper()\n  2\nend\njuliaEntry() = juliaHelper()`],
      ["unknown top-level statement", `juliaHelper() = 1\nunknownStatement()\njuliaEntry() = juliaHelper()`],
      ["macro eval", `juliaHelper() = 1\n@eval juliaHelper() = 2\njuliaEntry() = juliaHelper()`],
      ["rebinding", `juliaHelper() = 1\njuliaHelper = () -> 2\njuliaEntry() = juliaHelper()`],
      ["arity", `juliaHelper(value) = value\njuliaEntry() = juliaHelper(1)`],
      ["closure", `juliaHelper() = 1\njuliaEntry() = () -> juliaHelper()`],
      ["qualified", `juliaHelper() = 1\njuliaEntry() = Foreign.juliaHelper()`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractJuliaFileFacts({ filePath: "src/Smoke.jl", language: "julia", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("fails closed for Haskell imports, duplicate candidates, Template Haskell, local closures, arity, and qualified calls", () => {
    const sources = [
      ["import", `import Foreign\nhaskellHelper () = 1\nhaskellEntry () = haskellHelper ()`],
      ["duplicate target", `haskellHelper () = 1\nhaskellHelper () = 2\nhaskellEntry () = haskellHelper ()`],
      ["wildcard equation", `haskellHelper _ = 1\nhaskellHelper () = 2\nhaskellEntry () = haskellHelper ()`],
      ["multiline wildcard equation", `haskellHelper _\n  = 1\nhaskellHelper () = 2\nhaskellEntry () = haskellHelper ()`],
      ["split lhs wildcard equation", `haskellHelper\n  _ = 1\nhaskellHelper () = 2\nhaskellEntry () = haskellHelper ()`],
      ["template haskell", `haskellHelper () = 1\n$(pure [])\nhaskellEntry () = haskellHelper ()`],
      ["local closure", `haskellHelper () = 1\nhaskellEntry () = let haskellHelper () = 2 in haskellHelper ()`],
      ["arity", `haskellHelper value = value\nhaskellEntry () = haskellHelper 1`],
      ["qualified", `haskellHelper () = 1\nhaskellEntry () = Foreign.haskellHelper ()`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractHaskellFileFacts({ filePath: "src/Smoke.hs", language: "haskell", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
