import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  LUA_GRAMMAR_SHA256,
  LuaWorkerResponseError,
  validateLuaWorkerResponse
} from "../../../src/extraction/lua-worker-protocol.js";

const sourceBytes = new TextEncoder().encode("function alpha() end\n");
const fileSha256 = createHash("sha256").update(sourceBytes).digest("hex");

function response() {
  return {
    schema: "symbol-lattice-lua-worker-response-v2",
    requestId: "request-1",
    fileSha256,
    grammarSha256: LUA_GRAMMAR_SHA256,
    decision: { kind: "emit" },
    metrics: {
      sourceBytes: sourceBytes.byteLength,
      physicalLines: 1,
      functionCandidates: 1,
      namedFunctions: 1,
      maxDepth: 2
    },
    declarations: [{
      name: "alpha",
      form: "plain-function",
      declarationStartByte: 0,
      declarationEndByte: 20,
      nameStartByte: 9,
      nameEndByte: 14,
      bodyStartByte: 16,
      bodyEndByte: 20
    }],
    calls: []
  };
}

describe("Lua worker DTO boundary", () => {
  it("accepts one exact, source-ordered byte response", () => {
    expect(validateLuaWorkerResponse(response(), {
      requestId: "request-1",
      fileSha256,
      sourceBytes
    })).toEqual(response());
  });

  it("rejects unknown fields, tree objects, mismatched identities, and partial error output", () => {
    const mutations = [
      { ...response(), treeNodes: [] },
      { ...response(), requestId: "other" },
      { ...response(), fileSha256: "0".repeat(64) },
      { ...response(), grammarSha256: "0".repeat(64) },
      {
        ...response(),
        decision: { kind: "file-only", code: "ERROR" },
        declarations: response().declarations
      }
    ];

    for (const value of mutations) {
      expect(() => validateLuaWorkerResponse(value, {
        requestId: "request-1",
        fileSha256,
        sourceBytes
      })).toThrow(LuaWorkerResponseError);
    }
  });

  it("rejects unordered, out-of-bounds, UTF-8-splitting, and invalid-name declarations", () => {
    const unicodeBytes = new TextEncoder().encode("-- 😀\nfunction alpha() end\n");
    const unicodeHash = createHash("sha256").update(unicodeBytes).digest("hex");
    const base = {
      ...response(),
      fileSha256: unicodeHash,
      metrics: { ...response().metrics, sourceBytes: unicodeBytes.byteLength }
    };
    const declarations = [
      [{ ...response().declarations[0], declarationEndByte: unicodeBytes.byteLength + 1 }],
      [{ ...response().declarations[0], declarationStartByte: 4 }],
      [
        { ...response().declarations[0], declarationStartByte: 7, declarationEndByte: 27, nameStartByte: 16, nameEndByte: 21 },
        { ...response().declarations[0], declarationStartByte: 6, declarationEndByte: 27, nameStartByte: 16, nameEndByte: 21 }
      ],
      [{ ...response().declarations[0], name: "" }]
    ];

    for (const value of declarations) {
      expect(() => validateLuaWorkerResponse({ ...base, declarations: value }, {
        requestId: "request-1",
        fileSha256: unicodeHash,
        sourceBytes: unicodeBytes
      })).toThrow(LuaWorkerResponseError);
    }
  });

  it("accepts one singleton call and rejects call identity or candidate drift", () => {
    const text = "local function alpha() alpha() end";
    const bytes = new TextEncoder().encode(text);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const callStart = text.lastIndexOf("alpha");
    const value = {
      schema: "symbol-lattice-lua-worker-response-v2",
      requestId: "request-call",
      fileSha256: hash,
      grammarSha256: LUA_GRAMMAR_SHA256,
      decision: { kind: "emit" },
      metrics: { sourceBytes: bytes.length, physicalLines: 1, functionCandidates: 1, namedFunctions: 1, maxDepth: 4 },
      declarations: [{
        name: "alpha",
        form: "local-function",
        declarationStartByte: 0,
        declarationEndByte: bytes.length,
        nameStartByte: 15,
        nameEndByte: 20,
        bodyStartByte: 23,
        bodyEndByte: bytes.length - 4
      }],
      calls: [{
        sourceDeclarationIndex: 0,
        targetDeclarationIndex: 0,
        name: "alpha",
        startByte: callStart,
        endByte: callStart + 5,
        candidateDeclarationIndexes: [0],
        parserProvenance: "tree-sitter-lua-v0.5.0.function_call.bare-identifier"
      }]
    };
    expect(validateLuaWorkerResponse(value, { requestId: "request-call", fileSha256: hash, sourceBytes: bytes })).toEqual(value);
    for (const calls of [
      [{ ...value.calls[0], candidateDeclarationIndexes: [] }],
      [{ ...value.calls[0], name: "other" }],
      [{ ...value.calls[0], startByte: 1 }],
      [{ ...value.calls[0], parserProvenance: "untrusted" }]
    ]) {
      expect(() => validateLuaWorkerResponse({ ...value, calls }, { requestId: "request-call", fileSha256: hash, sourceBytes: bytes })).toThrow(LuaWorkerResponseError);
    }
  });
});
