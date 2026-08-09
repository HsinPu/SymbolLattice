import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractFsharpFileFacts } from "../../../src/extraction/fsharp.js";
import { extractNimFileFacts } from "../../../src/extraction/nim.js";
import { extractOcamlFileFacts } from "../../../src/extraction/ocaml.js";

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

describe("OCaml, F#, and Nim bounded same-file direct calls", () => {
  it("emits exact unique unit or zero-argument direct calls with full evidence", () => {
    const cases = [
      {
        language: "ocaml" as const,
        filePath: "src/Smoke.ml",
        entry: "ocamlEntry",
        helper: "ocamlHelper",
        ruleId: "syntax.ocaml.same-file.unique-top-level-unit-function-call",
        sourceText: `let ocamlHelper () = 1
let ocamlEntry () = ocamlHelper ()`,
        extract: extractOcamlFileFacts
      },
      {
        language: "fsharp" as const,
        filePath: "src/Smoke.fs",
        entry: "fsharpEntry",
        helper: "fsharpHelper",
        ruleId: "syntax.fsharp.same-file.unique-top-level-unit-function-call",
        sourceText: `let fsharpHelper () = 1
let fsharpEntry () = fsharpHelper ()`,
        extract: extractFsharpFileFacts
      },
      {
        language: "nim" as const,
        filePath: "src/smoke.nim",
        entry: "nimEntry",
        helper: "nimHelper",
        ruleId: "syntax.nim.same-file.unique-top-level-zero-argument-proc-call",
        sourceText: `proc nimHelper() = 1
proc nimEntry() = nimHelper()`,
        extract: extractNimFileFacts
      }
    ] as const;

    for (const testCase of cases) {
      const facts = testCase.extract({
        filePath: testCase.filePath,
        language: testCase.language,
        sourceText: testCase.sourceText
      });
      const caller = functionByName(facts, testCase.entry);
      const callee = functionByName(facts, testCase.helper);

      expect(calls(facts), testCase.language).toEqual([
        expect.objectContaining({
          sourceId: caller.id,
          targetId: callee.id,
          filePath: testCase.filePath,
          resolution: "exact",
          confidence: 1,
          referenceName: testCase.helper,
          evidence: {
            ruleId: testCase.ruleId,
            stage: "syntax",
            candidateSymbolIds: [callee.id]
          }
        })
      ]);
    }
  });

  it("fails closed for shadowing, visibility, dynamic forms, and non-unique declarations", () => {
    const cases = [
      ["ocaml parameter shadow", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `let ocamlEntry ocamlHelper = ocamlHelper ()\nlet ocamlHelper () = 1`],
      ["ocaml open", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `open Foreign\nlet ocamlEntry () = ocamlHelper ()\nlet ocamlHelper () = 1`],
      ["ocaml module", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `module Foreign = struct let ocamlHelper () = 2 end\nlet ocamlEntry () = ocamlHelper ()\nlet ocamlHelper () = 1`],
      ["ocaml operator", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `let ( ++ ) left right = left + right\nlet ocamlEntry () = ocamlHelper ()\nlet ocamlHelper () = 1`],
      ["ocaml arity", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `let ocamlEntry () = ocamlHelper ()\nlet ocamlHelper value = value`],
      ["ocaml nested", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `let ocamlEntry () = let ocamlHelper () = 2 in ocamlHelper ()\nlet ocamlHelper () = 1`],
      ["ocaml duplicate", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `let ocamlEntry () = ocamlHelper ()\nlet ocamlHelper () = 1\nlet ocamlHelper () = 2`],
      ["ocaml forward standard binding", extractOcamlFileFacts, "src/Smoke.ml", "ocaml", `let ocamlEntry () = ignore ()\nlet ignore () = 1`],
      ["fsharp parameter shadow", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `let fsharpEntry (fsharpHelper: unit -> int) = fsharpHelper ()\nlet fsharpHelper () = 1`],
      ["fsharp open", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `open Foreign\nlet fsharpEntry () = fsharpHelper ()\nlet fsharpHelper () = 1`],
      ["fsharp module", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `module Foreign\nlet fsharpEntry () = fsharpHelper ()\nlet fsharpHelper () = 1`],
      ["fsharp operator", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `let ( ++ ) left right = left + right\nlet fsharpEntry () = fsharpHelper ()\nlet fsharpHelper () = 1`],
      ["fsharp arity", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `let fsharpEntry () = fsharpHelper ()\nlet fsharpHelper value = value`],
      ["fsharp nested", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `let fsharpEntry () = let fsharpHelper () = 2 in fsharpHelper ()\nlet fsharpHelper () = 1`],
      ["fsharp duplicate", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `let fsharpEntry () = fsharpHelper ()\nlet fsharpHelper () = 1\nlet fsharpHelper () = 2`],
      ["fsharp forward standard binding", extractFsharpFileFacts, "src/Smoke.fs", "fsharp", `let fsharpEntry () = ignore ()\nlet ignore () = 1`],
      ["nim local shadow", extractNimFileFacts, "src/smoke.nim", "nim", `proc nimEntry() = block:\n  let nimHelper = proc(): int = 2\n  nimHelper()\nproc nimHelper() = 1`],
      ["nim import", extractNimFileFacts, "src/smoke.nim", "nim", `import foreign\nproc nimEntry() = nimHelper()\nproc nimHelper() = 1`],
      ["nim macro", extractNimFileFacts, "src/smoke.nim", "nim", `macro nimHelper(): untyped = 2\nproc nimEntry() = nimHelper()\nproc nimHelper() = 1`],
      ["nim operator", extractNimFileFacts, "src/smoke.nim", "nim", `proc \`nimHelper\`() = 2\nproc nimEntry() = nimHelper()\nproc nimHelper() = 1`],
      ["nim arity", extractNimFileFacts, "src/smoke.nim", "nim", `proc nimEntry() = nimHelper()\nproc nimHelper(value: int) = value`],
      ["nim nested", extractNimFileFacts, "src/smoke.nim", "nim", `proc nimEntry() = block:\n  proc nimHelper() = 2\n  nimHelper()\nproc nimHelper() = 1`],
      ["nim overload", extractNimFileFacts, "src/smoke.nim", "nim", `proc nimEntry() = nimHelper()\nproc nimHelper() = 1\nproc nimHelper(value: int) = value`],
      ["nim forward standard binding", extractNimFileFacts, "src/smoke.nim", "nim", `proc nimEntry() = quit()\nproc quit(): int = 1`]
    ] as const;

    for (const [description, extract, filePath, language, sourceText] of cases) {
      const facts = extract({ filePath, language, sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
