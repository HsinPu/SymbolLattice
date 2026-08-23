import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { projectLuaStructuralFacts } from "../../../src/extraction/lua-structural.js";
import {
  LUA_GRAMMAR_SHA256,
  LUA_WORKER_RESPONSE_SCHEMA,
  type LuaFunctionForm,
  type LuaWorkerDeclaration,
  type LuaWorkerResponse
} from "../../../src/extraction/lua-worker-protocol.js";

const encoder = new TextEncoder();

function declaration(
  sourceBytes: Uint8Array,
  sourceText: string,
  name: string,
  form: LuaFunctionForm,
  occurrence = 0
): LuaWorkerDeclaration {
  const nameBytes = encoder.encode(name);
  let nameStartByte = -1;
  let cursor = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    nameStartByte = Buffer.from(sourceBytes).indexOf(nameBytes, cursor);
    cursor = nameStartByte + nameBytes.byteLength;
  }
  const declarationStartByte = Buffer.from(sourceBytes).lastIndexOf(
    encoder.encode(form === "local-function" ? "local function" : "function"),
    nameStartByte
  );
  const declarationTextStart = Buffer.from(sourceBytes.subarray(0, declarationStartByte)).toString("utf8").length;
  const endText = sourceText.indexOf("end", declarationTextStart) + 3;
  const declarationEndByte = encoder.encode(sourceText.slice(0, endText)).byteLength;
  return {
    name,
    form,
    declarationStartByte,
    declarationEndByte,
    nameStartByte,
    nameEndByte: nameStartByte + nameBytes.byteLength
  };
}

function response(sourceBytes: Uint8Array, declarations: readonly LuaWorkerDeclaration[]): LuaWorkerResponse {
  return {
    schema: LUA_WORKER_RESPONSE_SCHEMA,
    requestId: "test",
    fileSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    grammarSha256: LUA_GRAMMAR_SHA256,
    decision: { kind: "emit" },
    metrics: {
      sourceBytes: sourceBytes.byteLength,
      physicalLines: 4,
      functionCandidates: declarations.length,
      namedFunctions: declarations.length,
      maxDepth: 3
    },
    declarations
  };
}

describe("Lua structural v1.2 projector", () => {
  it("projects only grammar-authorized direct-root forms with exact IDs and evidence", () => {
    const sourceText = [
      "function plain() end",
      "local function local_name() end",
      "function owner.child() end",
      "function owner:method() end"
    ].join("\n");
    const sourceBytes = encoder.encode(sourceText);
    const declarations = [
      declaration(sourceBytes, sourceText, "plain", "plain-function"),
      declaration(sourceBytes, sourceText, "local_name", "local-function"),
      declaration(sourceBytes, sourceText, "owner.child", "dotted-function"),
      declaration(sourceBytes, sourceText, "owner:method", "colon-function")
    ];

    const facts = projectLuaStructuralFacts({
      filePath: "src/forms.lua",
      sourceBytes,
      response: response(sourceBytes, declarations)
    });

    expect(facts.symbols.filter(({ kind }) => kind !== "file")).toEqual([
      expect.objectContaining({ name: "plain", qualifiedName: "src/forms.lua#plain", declarationOrdinal: 0, isExported: true }),
      expect.objectContaining({ name: "local_name", qualifiedName: "src/forms.lua#local_name", declarationOrdinal: 0, isExported: false }),
      expect.objectContaining({ name: "child", qualifiedName: "src/forms.lua#owner.child", kind: "method", declarationOrdinal: 0, isExported: true }),
      expect.objectContaining({ name: "method", qualifiedName: "src/forms.lua#owner:method", kind: "method", declarationOrdinal: 0, isExported: true })
    ]);
    expect(facts.edges).toHaveLength(4);
    for (const edge of facts.edges) {
      expect(edge).toMatchObject({
        kind: "contains",
        resolution: "exact",
        confidence: 1,
        evidence: {
          ruleId: "language.lua.function.direct-root.tree-sitter-lua-v0.5",
          stage: "syntax",
          candidateSymbolIds: [edge.targetId]
        }
      });
    }
    expect(facts.pendingReferences).toEqual([]);
  });

  it("maps raw UTF-8 bytes to 1-based UTF-16 ranges and stable duplicate ordinals", () => {
    const sourceText = "-- 😀\r\nfunction dup() end\r\nfunction dup() end\r\n";
    const sourceBytes = encoder.encode(sourceText);
    const declarations = [
      declaration(sourceBytes, sourceText, "dup", "plain-function", 0),
      declaration(sourceBytes, sourceText, "dup", "plain-function", 1)
    ];
    const facts = projectLuaStructuralFacts({
      filePath: "unicode.lua",
      sourceBytes,
      response: response(sourceBytes, declarations)
    });
    const functions = facts.symbols.filter(({ kind }) => kind === "function");

    expect(functions.map(({ declarationOrdinal }) => declarationOrdinal)).toEqual([0, 1]);
    expect(functions.map(({ range }) => range)).toEqual([
      { start: { line: 2, column: 1 }, end: { line: 2, column: 19 } },
      { start: { line: 3, column: 1 }, end: { line: 3, column: 19 } }
    ]);
  });

  it("returns the existing file symbol only for every file-only decision", () => {
    const sourceBytes = encoder.encode("local function hidden() end\n");
    const workerResponse: LuaWorkerResponse = {
      ...response(sourceBytes, []),
      decision: { kind: "file-only", code: "ERROR" }
    };
    const facts = projectLuaStructuralFacts({
      filePath: "invalid.lua",
      sourceBytes,
      response: workerResponse
    });

    expect(facts.symbols).toEqual([expect.objectContaining({ kind: "file", qualifiedName: "invalid.lua" })]);
    expect(facts.edges).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
  });
});
