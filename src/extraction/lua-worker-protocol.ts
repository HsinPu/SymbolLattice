export const LUA_WORKER_RESPONSE_SCHEMA = "symbol-lattice-lua-worker-response-v2" as const;
export const LUA_GRAMMAR_SHA256 =
  "609f25f03773c8eaa3e94c504f360e770c49009ba9383b65be581b2d51774b71" as const;
export const LUA_MAXIMUM_SOURCE_BYTES = 1_048_576 as const;
export const LUA_MAXIMUM_PHYSICAL_LINES = 16_384 as const;
export const LUA_MAXIMUM_FUNCTIONS = 1_024 as const;
export const LUA_MAXIMUM_NESTING = 256 as const;

export type LuaFunctionForm =
  | "plain-function"
  | "local-function"
  | "dotted-function"
  | "colon-function";

export type LuaFileFailureCode =
  | "RAW_BYTES_MISSING"
  | "INVALID_UTF8"
  | "NUL"
  | "SOURCE_LIMIT"
  | "LINE_LIMIT"
  | "FUNCTION_LIMIT"
  | "NESTING_LIMIT"
  | "ERROR"
  | "MISSING"
  | "TIMEOUT"
  | "WORKER_CRASH"
  | "RESPONSE_INVALID";

export interface LuaWorkerDeclaration {
  readonly name: string;
  readonly form: LuaFunctionForm;
  readonly declarationStartByte: number;
  readonly declarationEndByte: number;
  readonly nameStartByte: number;
  readonly nameEndByte: number;
  readonly bodyStartByte: number;
  readonly bodyEndByte: number;
}

export interface LuaWorkerCall {
  readonly sourceDeclarationIndex: number;
  readonly targetDeclarationIndex: number;
  readonly name: string;
  readonly startByte: number;
  readonly endByte: number;
  readonly candidateDeclarationIndexes: readonly number[];
  readonly parserProvenance: "tree-sitter-lua-v0.5.0.function_call.bare-identifier";
}

export interface LuaWorkerMetrics {
  readonly sourceBytes: number;
  readonly physicalLines: number;
  readonly functionCandidates: number;
  readonly namedFunctions: number;
  readonly maxDepth: number;
}

export interface LuaWorkerResponse {
  readonly schema: typeof LUA_WORKER_RESPONSE_SCHEMA;
  readonly requestId: string;
  readonly fileSha256: string;
  readonly grammarSha256: typeof LUA_GRAMMAR_SHA256;
  readonly decision:
    | { readonly kind: "emit" }
    | { readonly kind: "file-only"; readonly code: LuaFileFailureCode };
  readonly metrics: LuaWorkerMetrics;
  readonly declarations: readonly LuaWorkerDeclaration[];
  readonly calls: readonly LuaWorkerCall[];
}

export interface LuaWorkerResponseContext {
  readonly requestId: string;
  readonly fileSha256: string;
  readonly sourceBytes: Uint8Array;
}

export class LuaWorkerResponseError extends Error {
  public override readonly name = "LuaWorkerResponseError";
}

const RESPONSE_KEYS = new Set([
  "schema",
  "requestId",
  "fileSha256",
  "grammarSha256",
  "decision",
  "metrics",
  "declarations",
  "calls"
]);
const DECISION_EMIT_KEYS = new Set(["kind"]);
const DECISION_FILE_ONLY_KEYS = new Set(["kind", "code"]);
const METRIC_KEYS = new Set([
  "sourceBytes",
  "physicalLines",
  "functionCandidates",
  "namedFunctions",
  "maxDepth"
]);
const DECLARATION_KEYS = new Set([
  "name",
  "form",
  "declarationStartByte",
  "declarationEndByte",
  "nameStartByte",
  "nameEndByte",
  "bodyStartByte",
  "bodyEndByte"
]);
const CALL_KEYS = new Set([
  "sourceDeclarationIndex",
  "targetDeclarationIndex",
  "name",
  "startByte",
  "endByte",
  "candidateDeclarationIndexes",
  "parserProvenance"
]);
const FORMS = new Set<LuaFunctionForm>([
  "plain-function",
  "local-function",
  "dotted-function",
  "colon-function"
]);
const FAILURE_CODES = new Set<LuaFileFailureCode>([
  "RAW_BYTES_MISSING",
  "INVALID_UTF8",
  "NUL",
  "SOURCE_LIMIT",
  "LINE_LIMIT",
  "FUNCTION_LIMIT",
  "NESTING_LIMIT",
  "ERROR",
  "MISSING",
  "TIMEOUT",
  "WORKER_CRASH",
  "RESPONSE_INVALID"
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const decoder = new TextDecoder("utf-8", { fatal: true });

export function validateLuaWorkerResponse(
  value: unknown,
  context: LuaWorkerResponseContext
): LuaWorkerResponse {
  if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS)) {
    throw invalid("Lua worker response must use the exact response schema.");
  }
  if (
    value.schema !== LUA_WORKER_RESPONSE_SCHEMA ||
    value.requestId !== context.requestId ||
    value.fileSha256 !== context.fileSha256 ||
    value.grammarSha256 !== LUA_GRAMMAR_SHA256 ||
    !SHA256.test(String(value.fileSha256))
  ) {
    throw invalid("Lua worker response identity or grammar hash mismatch.");
  }
  const decision = validateDecision(value.decision);
  const metrics = validateMetrics(value.metrics, context.sourceBytes.byteLength);
  if (!Array.isArray(value.declarations)) {
    throw invalid("Lua worker declarations must be an array.");
  }
  if (!Array.isArray(value.calls)) {
    throw invalid("Lua worker calls must be an array.");
  }
  if (decision.kind === "file-only" && (value.declarations.length !== 0 || value.calls.length !== 0)) {
    throw invalid("Lua worker file-only response must not contain partial facts.");
  }
  if (value.declarations.length > LUA_MAXIMUM_FUNCTIONS) {
    throw invalid("Lua worker response exceeded the declaration limit.");
  }

  const declarations: LuaWorkerDeclaration[] = [];
  let previousStart = -1;
  let previousEnd = 0;
  for (const [index, candidate] of value.declarations.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, DECLARATION_KEYS)) {
      throw invalid(`Lua worker declaration ${index} has an invalid shape.`);
    }
    const { name, form, declarationStartByte, declarationEndByte, nameStartByte, nameEndByte, bodyStartByte, bodyEndByte } = candidate;
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      name.includes("\0") ||
      CONTROL_CHARACTER.test(name) ||
      typeof form !== "string" ||
      !FORMS.has(form as LuaFunctionForm) ||
      !validOffset(declarationStartByte) ||
      !validOffset(declarationEndByte) ||
      !validOffset(nameStartByte) ||
      !validOffset(nameEndByte) ||
      !validOffset(bodyStartByte) ||
      !validOffset(bodyEndByte) ||
      declarationStartByte < previousStart ||
      declarationStartByte < previousEnd ||
      declarationStartByte >= declarationEndByte ||
      nameStartByte < declarationStartByte ||
      nameStartByte >= nameEndByte ||
      nameEndByte > declarationEndByte ||
      bodyStartByte < declarationStartByte ||
      bodyStartByte > bodyEndByte ||
      bodyEndByte > declarationEndByte ||
      declarationEndByte > context.sourceBytes.byteLength
    ) {
      throw invalid(`Lua worker declaration ${index} has invalid or unordered boundaries.`);
    }
    try {
      decoder.decode(context.sourceBytes.subarray(declarationStartByte, declarationEndByte));
      const sourceName = decoder.decode(context.sourceBytes.subarray(nameStartByte, nameEndByte));
      if (sourceName !== name) {
        throw invalid(`Lua worker declaration ${index} name does not match source bytes.`);
      }
    } catch (error) {
      if (error instanceof LuaWorkerResponseError) throw error;
      throw invalid(`Lua worker declaration ${index} splits a UTF-8 boundary.`);
    }
    declarations.push({
      name,
      form: form as LuaFunctionForm,
      declarationStartByte,
      declarationEndByte,
      nameStartByte,
      nameEndByte,
      bodyStartByte,
      bodyEndByte
    });
    previousStart = declarationStartByte;
    previousEnd = declarationEndByte;
  }
  if (metrics.namedFunctions < declarations.length) {
    throw invalid("Lua worker metrics undercount named declarations.");
  }
  const calls: LuaWorkerCall[] = [];
  let previousCallKey = "";
  for (const [index, candidate] of value.calls.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, CALL_KEYS)) {
      throw invalid(`Lua worker call ${index} has an invalid shape.`);
    }
    const { sourceDeclarationIndex, targetDeclarationIndex, name, startByte, endByte, candidateDeclarationIndexes, parserProvenance } = candidate;
    const source = declarations[sourceDeclarationIndex as number];
    const target = declarations[targetDeclarationIndex as number];
    if (
      !validOffset(sourceDeclarationIndex) ||
      !validOffset(targetDeclarationIndex) ||
      typeof name !== "string" ||
      !validOffset(startByte) ||
      !validOffset(endByte) ||
      !Array.isArray(candidateDeclarationIndexes) ||
      candidateDeclarationIndexes.length !== 1 ||
      candidateDeclarationIndexes[0] !== targetDeclarationIndex ||
      parserProvenance !== "tree-sitter-lua-v0.5.0.function_call.bare-identifier" ||
      source === undefined ||
      target === undefined ||
      target.name !== name ||
      startByte < source.bodyStartByte ||
      startByte >= endByte ||
      endByte > source.bodyEndByte ||
      decodeSlice(context.sourceBytes, startByte, endByte) !== name
    ) {
      throw invalid(`Lua worker call ${index} has invalid identity or boundaries.`);
    }
    const key = `${String(sourceDeclarationIndex).padStart(8, "0")}:${String(startByte).padStart(12, "0")}`;
    if (key <= previousCallKey) throw invalid(`Lua worker call ${index} is duplicated or unordered.`);
    previousCallKey = key;
    calls.push({ sourceDeclarationIndex, targetDeclarationIndex, name, startByte, endByte, candidateDeclarationIndexes: [targetDeclarationIndex], parserProvenance });
  }
  return {
    schema: LUA_WORKER_RESPONSE_SCHEMA,
    requestId: context.requestId,
    fileSha256: context.fileSha256,
    grammarSha256: LUA_GRAMMAR_SHA256,
    decision,
    metrics,
    declarations,
    calls
  };
}

function decodeSlice(bytes: Uint8Array, start: number, end: number): string {
  try {
    return decoder.decode(bytes.subarray(start, end));
  } catch {
    return "";
  }
}

function validateDecision(value: unknown): LuaWorkerResponse["decision"] {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw invalid("Lua worker decision is invalid.");
  }
  if (value.kind === "emit" && hasExactKeys(value, DECISION_EMIT_KEYS)) return { kind: "emit" };
  if (
    value.kind === "file-only" &&
    hasExactKeys(value, DECISION_FILE_ONLY_KEYS) &&
    typeof value.code === "string" &&
    FAILURE_CODES.has(value.code as LuaFileFailureCode)
  ) {
    return { kind: "file-only", code: value.code as LuaFileFailureCode };
  }
  throw invalid("Lua worker decision has unknown fields or failure code.");
}

function validateMetrics(value: unknown, expectedSourceBytes: number): LuaWorkerMetrics {
  if (!isRecord(value) || !hasExactKeys(value, METRIC_KEYS)) {
    throw invalid("Lua worker metrics have an invalid shape.");
  }
  const metrics = value as unknown as LuaWorkerMetrics;
  if (
    !validOffset(metrics.sourceBytes) ||
    metrics.sourceBytes !== expectedSourceBytes ||
    !validOffset(metrics.physicalLines) ||
    !validOffset(metrics.functionCandidates) ||
    !validOffset(metrics.namedFunctions) ||
    !validOffset(metrics.maxDepth) ||
    metrics.physicalLines > LUA_MAXIMUM_PHYSICAL_LINES ||
    metrics.functionCandidates > LUA_MAXIMUM_FUNCTIONS ||
    metrics.namedFunctions > LUA_MAXIMUM_FUNCTIONS ||
    metrics.maxDepth > LUA_MAXIMUM_NESTING
  ) {
    throw invalid("Lua worker metrics exceed their contract bounds.");
  }
  return {
    sourceBytes: metrics.sourceBytes,
    physicalLines: metrics.physicalLines,
    functionCandidates: metrics.functionCandidates,
    namedFunctions: metrics.namedFunctions,
    maxDepth: metrics.maxDepth
  };
}

function validOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): LuaWorkerResponseError {
  return new LuaWorkerResponseError(message);
}
