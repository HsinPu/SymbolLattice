import { parentPort, workerData } from "node:worker_threads";

import { Language, Parser } from "web-tree-sitter";

import {
  LUA_GRAMMAR_SHA256,
  LUA_WORKER_RESPONSE_SCHEMA,
  type LuaFileFailureCode,
  type LuaWorkerDeclaration,
  type LuaWorkerMetrics,
  type LuaWorkerResponse
} from "./lua-worker-protocol.js";
import { emptyLuaMetrics, inspectLuaTree } from "./lua-worker-ast.js";

interface LuaWorkerData {
  readonly schema: "symbol-lattice-lua-worker-init-v1";
  readonly runtimeWasmBytes: ArrayBuffer;
  readonly grammarWasmBytes: ArrayBuffer;
  readonly grammarSha256: string;
}

interface LuaWorkerMessage {
  readonly requestId: string;
  readonly filePath: string;
  readonly sourceBytes: ArrayBuffer;
  readonly fileSha256: string;
}

const data = workerData as LuaWorkerData;
if (
  data.schema !== "symbol-lattice-lua-worker-init-v1" ||
  data.grammarSha256 !== LUA_GRAMMAR_SHA256 ||
  !(data.runtimeWasmBytes instanceof ArrayBuffer) ||
  !(data.grammarWasmBytes instanceof ArrayBuffer)
) {
  throw new Error("Lua worker received invalid immutable initialization data.");
}

await Parser.init({ wasmBinary: new Uint8Array(data.runtimeWasmBytes) } as never);
const language = await Language.load(new Uint8Array(data.grammarWasmBytes));
const parser = new Parser();
parser.setLanguage(language);
parentPort?.postMessage({ kind: "ready" });

parentPort?.on("message", (message: LuaWorkerMessage) => {
  const sourceBytes = new Uint8Array(message.sourceBytes);
  const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
  const parserSourceText = sourceText.replaceAll("\r\n", "\n");
  const tree = parser.parse(parserSourceText);
  if (tree === null) {
    parentPort?.postMessage(fileOnly(message, "ERROR", emptyLuaMetrics(sourceBytes)));
    parser.delete();
    return;
  }
  try {
    const result = inspectLuaTree(tree.rootNode, sourceBytes, parserSourceText);
    parentPort?.postMessage(
      result.code === null
        ? response(message, { kind: "emit" }, result.metrics, result.declarations)
        : fileOnly(message, result.code, result.metrics)
    );
  } finally {
    tree.delete();
    parser.delete();
  }
});

function response(
  message: LuaWorkerMessage,
  decision: LuaWorkerResponse["decision"],
  metrics: LuaWorkerMetrics,
  declarations: readonly LuaWorkerDeclaration[]
): LuaWorkerResponse {
  return {
    schema: LUA_WORKER_RESPONSE_SCHEMA,
    requestId: message.requestId,
    fileSha256: message.fileSha256,
    grammarSha256: LUA_GRAMMAR_SHA256,
    decision,
    metrics,
    declarations
  };
}

function fileOnly(
  message: LuaWorkerMessage,
  code: LuaFileFailureCode,
  metrics: LuaWorkerMetrics
): LuaWorkerResponse {
  return response(message, { kind: "file-only", code }, metrics, []);
}
