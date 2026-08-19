import { describe, expect, it } from "vitest";

import { extractShellFileFacts } from "../../../src/extraction/shell.js";
import {
  ShellParserPackagingError,
  type ShellParser,
  type ShellParserResult
} from "../../../src/extraction/shell-wasm-runtime.js";

const input = (filePath: string, sourceText: string) => ({
  filePath,
  sourceText,
  language: "shell" as const
});

describe("Shell structural v1.2.2 extraction", () => {
  it("emits only direct-root identities and exact contains edges for same-line declarations", () => {
    const sourceText = [
      "#!/bin/sh",
      "left() { inner() { :; }; }; right() { :; }",
      "if :; then conditional() { :; }; fi",
      "(subshell_fn() { :; })",
      "value=$(command_fn() { :; }; command_fn)",
      ""
    ].join("\n");

    const facts = extractShellFileFacts(input("script.sh", sourceText));

    expect(facts.symbols.map(({ name }) => name)).toEqual(["script.sh", "left", "right"]);
    expect(facts.edges.map(({ kind }) => kind)).toEqual(["contains", "contains"]);
    expect(facts.edges.every(({ resolution, confidence }) => resolution === "exact" && confidence === 1))
      .toBe(true);
    expect(facts.pendingReferences).toEqual([]);
    expect(facts.exportBindings).toEqual([]);
  });

  it("projects UTF-8 byte offsets into exact UTF-16 CRLF ranges", () => {
    const facts = extractShellFileFacts(input("unicode.sh", "# 😀\r\nuni() { :; }\r\n"));
    const symbol = facts.symbols.find(({ name }) => name === "uni");

    expect(symbol?.range).toEqual({
      start: { line: 2, column: 1 },
      end: { line: 2, column: 13 }
    });
  });

  it("assigns duplicate ordinals in parser source order", () => {
    const facts = extractShellFileFacts(input("duplicates.sh", "dup() { :; }; dup() { :; }\n"));
    const duplicates = facts.symbols.filter(({ name }) => name === "dup");

    expect(duplicates.map(({ declarationOrdinal }) => declarationOrdinal)).toEqual([0, 1]);
    expect(new Set(duplicates.map(({ id }) => id)).size).toBe(2);
  });

  it("preserves the frozen Kubernetes common.sh function identity and range", () => {
    // Frozen trigger: actual/kubernetes/build/common.sh lines 119-137,
    // SHA-256 ecb24ce39be66a111ad3ec9e30a00539201478f0bde163f196b1de60ea2d328a.
    const sourceText = [
      "#!/usr/bin/env bash",
      "# $1 - server architecture",
      "kube::build::get_docker_wrapped_binaries() {",
      "  local targets=(",
      "    \"kube-apiserver,${KUBE_APISERVER_BASE_IMAGE}\"",
      "  )",
      "",
      "  echo \"${targets[@]}\"",
      "}",
      ""
    ].join("\n");

    const facts = extractShellFileFacts(input("actual/kubernetes/build/common.sh", sourceText));
    const symbol = facts.symbols.find(({ kind }) => kind === "function");

    expect(symbol).toMatchObject({
      id: "symbol:actual%2Fkubernetes%2Fbuild%2Fcommon.sh:actual%2Fkubernetes%2Fbuild%2Fcommon.sh%23kube%3A%3Abuild%3A%3Aget_docker_wrapped_binaries:function:0",
      name: "kube::build::get_docker_wrapped_binaries",
      qualifiedName: "actual/kubernetes/build/common.sh#kube::build::get_docker_wrapped_binaries",
      declarationOrdinal: 0,
      range: {
        start: { line: 3, column: 1 },
        end: { line: 9, column: 2 }
      }
    });
    expect(facts.edges).toHaveLength(1);
    expect(facts.edges[0]).toMatchObject({ targetId: symbol?.id, kind: "contains" });
  });

  it("uses mvdan semantic names while preserving raw continued declaration ranges", () => {
    const sourceText = "#!/bin/bash\nfunction foo\\" + "\n" + "bar { :; }\n";
    const facts = extractShellFileFacts(input("continued.bash", sourceText));
    const symbol = facts.symbols.find(({ kind }) => kind === "function");

    expect(symbol).toMatchObject({
      id: "symbol:continued.bash:continued.bash%23foobar:function:0",
      name: "foobar",
      qualifiedName: "continued.bash#foobar",
      declarationOrdinal: 0,
      range: {
        start: { line: 2, column: 1 },
        end: { line: 3, column: 11 }
      }
    });
  });

  it("applies extension and exact raw-first-line dialect rules", () => {
    const cases = [
      ["posix-in-bash.bash", "#!/bin/sh\nf() { :; }\n", []],
      ["foreign.sh", "#!/usr/bin/python3\nf() { :; }\n", []],
      ["foreign.bash", "#!/usr/bin/env zsh\nf() { :; }\n", []],
      ["bash-mode.sh", "#!/bin/bash\nfunction f { :; }\n", ["f"]],
      ["tool.with.dots", "#!/usr/bin/env bash\nfunction f() { :; }\n", ["f"]]
    ] as const;

    for (const [filePath, sourceText, expectedFunctions] of cases) {
      const facts = extractShellFileFacts(input(filePath, sourceText));
      expect(facts.symbols.filter(({ kind }) => kind === "function").map(({ name }) => name))
        .toEqual(expectedFunctions);
    }
  });

  it("does not turn export -f into a reference, pending fact, or export binding", () => {
    const facts = extractShellFileFacts(input(
      "controls/export-f.bash",
      "#!/bin/bash\nf() { :; }\nexport -f f\n"
    ));

    expect(facts.symbols.filter(({ kind }) => kind === "function").map(({ name }) => name))
      .toEqual(["f"]);
    expect(facts.edges.map(({ kind }) => kind)).toEqual(["contains"]);
    expect(facts.pendingReferences).toEqual([]);
    expect(facts.exportBindings).toEqual([]);
  });

  it("makes every adapter source/parser response code file-only", () => {
    for (let code = 1; code <= 10; code += 1) {
      const parser: ShellParser = () => ({ ok: false, code } as ShellParserResult);
      const facts = extractShellFileFacts(input("source.sh", "f() { :; }\n"), parser);
      expect(facts.symbols.map(({ kind }) => kind), `code ${code}`).toEqual(["file"]);
      expect(facts.edges, `code ${code}`).toEqual([]);
    }
  });

  it("propagates typed packaging errors so generation aborts", () => {
    const parser: ShellParser = () => {
      throw new ShellParserPackagingError("asset-missing", "missing");
    };

    expect(() => extractShellFileFacts(input("source.sh", "f() { :; }\n"), parser))
      .toThrowError(expect.objectContaining({ code: "asset-missing" }));
  });
});
