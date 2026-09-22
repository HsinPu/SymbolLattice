import { describe, expect, it } from "vitest";
import { renderExploreText } from "../../src/mcp/explore-text.js";
import { sourceDeliveryIdentityFromText } from "../../src/application/source-delivery.js";
import { McpSourceSession } from "../../src/mcp/source-session.js";

describe("MCP explore text rendering", () => {
  it("labels supplementary same-name declarations as unresolved and cites the originating calls", () => {
    const output = renderExploreText({ queryPlan: { nameFollowupSearch: { state: "searched", callsTruncated: true } }, focuses: [{
      symbol: { name: "resolve_error_handler" }, numericQualifier: { terms: ["503"] },
      nameFollowup: { matchingDeclarationCount: 2, calls: [{ referenceName: "resolver.resolve_error_handler",
        resolution: "unresolved", filePath: "request.py", range: { start: { line: 12, column: 5 } } }] }
    }] });
    expect(output).toContain("Supplementary same-name declaration; the call target remains unresolved");
    expect(output).toContain("request.py:12");
    expect(output).toContain("2 same-name declarations in the bounded candidates");
    expect(output).toContain("not a repository-wide uniqueness claim");
    expect(output).toContain("Numeric qualifier: `503`");
    expect(output).toContain("follow-up search reached its call or candidate bounds");
  });
  it("renders unknown call sites without claiming a target and discloses partial or mismatched reads", () => {
    const output = renderExploreText({ focuses: [
      { symbol: { name: "handle" }, unresolvedCalls: { state: "available", truncated: true, items: [{
        referenceName: "resolver.resolve_error_handler", resolution: "unresolved", filePath: "handler.py",
        range: { start: { line: 184, column: 16 } }, evidence: { ruleId: "syntax.python.member-call.unknown-receiver", stage: "syntax" }
      }] } },
      { symbol: { name: "changed" }, unresolvedCalls: { state: "generation-mismatch", items: [], truncated: false } }
    ] });
    expect(output).toContain("`handle` invokes `resolver.resolve_error_handler`");
    expect(output).toContain("handler.py:184");
    expect(output).toContain("target unknown");
    expect(output).toContain("Additional recorded calls for `handle` were truncated");
    expect(output).toContain("generation-mismatch");
    expect(output).not.toContain("`handle` → `resolver.resolve_error_handler`");
  });
  it("cites shared source and every selected flow step even without a path-spine slot", () => {
    const text = renderExploreText({ focuses: [{ symbol: { name: "later" }, sourceReuse: { segments: [{
      referenceIndex: 0, filePath: "a.ts", range: { start: { line: 8 } }
    }] }, focusCoverage: { flow: { truncated: true, path: { steps: [{ from: { name: "anchor" }, to: { name: "later" },
      edge: { kind: "calls", resolution: "exact", filePath: "a.ts", range: { start: { line: 9 } } } }] } } } }] });
    expect(text).toContain("Shared source: focus #1 at `a.ts:8`");
    expect(text).toContain("`anchor` → `later` (calls)");
    expect(text).toContain("at `a.ts:9`");
    expect(text).toContain("Downstream focus search reached its bounds");
  });
  it("distinguishes callee lexical matches from call proof and discloses search limits", () => {
    const output = renderExploreText({ focuses: [{ symbol: { name: "run" } }], sourceWindows: [{
      sourceMatches: [{ term: "cleanup", token: "cleanup", filePath: "a.ts", range: { start: { line: 9, column: 3 } } }]
    }], sourceWindowPlan: { calleeSourceSearch: { truncated: true, unavailableFiles: ["b.ts"] } } });
    expect(output).toContain("Related source terms (lexical, not resolved relationships)");
    expect(output).toContain("`cleanup` → `cleanup` at `a.ts:9`");
    expect(output).toContain("Related callee source search reached its bounds");
    expect(output).toContain("Indexed callee source is unavailable for: `b.ts`");
  });
  it("retains CommonJS import/export receipts alongside the call site", () => {
    const output = renderExploreText({ connections: [{ source: { name: "start" }, target: { name: "handle" },
      edge: { kind: "calls", resolution: "exact", filePath: "consumer.js", range: { start: { line: 9 } },
        evidence: { commonJsBinding: { localName: "run", importedName: "handle",
          importSite: { filePath: "consumer.js", range: { start: { line: 2 } } },
          exportSite: { filePath: "provider.js", range: { start: { line: 20 } } } } } } }] });
    expect(output).toContain("at `consumer.js:9`");
    expect(output).toContain("CommonJS `run` ← `handle`");
    expect(output).toContain("import `consumer.js:2`; export `provider.js:20`");
  });
  it("retains lexical ranking evidence and discloses its bounded scope without claiming resolved relations", () => {
    const text = renderExploreText({ focuses: [{ symbol: { name: "run", filePath: "a.ts" },
      sourceMatches: [{ term: "refunds", token: "refund", filePath: "a.ts", range: { start: { line: 5, column: 3 } } }] }],
      queryPlan: { sourceLexical: { state: "searched", truncated: true } } });
    expect(text).toContain("Source terms (lexical, not resolved relationships)");
    expect(text).toContain("`refunds` → `refund` at `a.ts:5`");
    expect(text).toContain("Callable-source lexical search reached its scan bounds");
  });
  it("renders a concise Markdown result instead of exposing diagnostic JSON", () => {
    const text = renderExploreText({
      status: {
        initialized: true,
        stale: true,
        staleReasons: ["source-files-changed"],
        projectPath: "C:/project",
        generationId: "generation:test",
        counts: { files: 12, symbols: 34, edges: 56, pendingReferences: 7 }
      },
      mode: "query",
      match: { status: "not_found", reference: "user handler", candidates: [] },
      queryPlan: { query: "user handler", selection: [{ internal: "diagnostic" }] },
      focuses: [{
        rank: 1,
        symbol: {
          qualifiedName: "src/users.ts#userById",
          name: "userById",
          kind: "function",
          filePath: "src/users.ts",
          range: { start: { line: 12, column: 1 }, end: { line: 14, column: 2 } }
        },
        source: {
          filePath: "src/users.ts",
          startLine: 12,
          endLine: 14,
          lines: [
            { line: 12, text: "export function userById() {" },
            { line: 13, text: "  return findUser();" },
            { line: 14, text: "}" }
          ],
          text: "export function userById() {\n  return findUser();\n}",
          sourceIdentity: { internal: "diagnostic" }
        }
      }],
      connections: [{
        source: { qualifiedName: "src/users.ts#userById" },
        target: { qualifiedName: "src/db.ts#findUser" },
        edge: { kind: "calls", filePath: "src/users.ts", range: { start: { line: 13 } } }
      }],
      connectionsTruncated: false,
      sourceWindows: [],
      evidencePaths: [],
      sourceWindowAllocation: { internal: "diagnostic" }
    });

    expect(text).toContain("**Exploration: user handler**");
    expect(text).toContain("Index: stale");
    expect(text).toContain("Found 1 ranked focus");
    expect(text).toContain("`src/users.ts#userById` → `src/db.ts#findUser` (calls)");
    expect(text).toContain("at `src/users.ts:13`");
    expect(text).toContain("12\texport function userById() {");
    expect(text).not.toContain("queryPlan");
    expect(text).not.toContain("sourceIdentity");
    expect(text).not.toContain("sourceWindowAllocation");
  });

  it("renders an actionable missing-symbol response", () => {
    const text = renderExploreText({
      status: {
        initialized: true,
        stale: false,
        projectPath: "C:/project",
        generationId: "generation:test",
        counts: { files: 1, symbols: 1, edges: 0, pendingReferences: 0 }
      },
      match: { status: "not_found", reference: "missing", candidates: [] },
      source: null,
      callers: [],
      callees: [],
      impact: []
    });

    expect(text).toContain("**Exploration: missing**");
    expect(text).toContain("No exact symbol found for `missing`.");
    expect(text).toContain("does not prove the symbol or relationship is absent");
    expect(text.trim().startsWith("{")).toBe(false);
  });

  it("keeps each path step's evidence and distinguishes failed bounded searches", () => {
    const first = { qualifiedName: "api#handle" };
    const bridge = { qualifiedName: "service#load" };
    const last = { qualifiedName: "db#read" };
    const text = renderExploreText({
      evidencePaths: [
        { status: "path", fromReference: "api#handle", toReference: "db#read", path: { steps: [
          { from: first, to: bridge, edge: { kind: "calls", resolution: "exact", filePath: "api.ts", range: { start: { line: 8 } }, evidence: { ruleId: "direct-call", stage: "lexical" } } },
          { from: bridge, to: last, edge: { kind: "calls", resolution: "exact", filePath: "service.ts", range: { start: { line: 21 } }, evidence: { ruleId: "import-call", stage: "module" } } }
        ] } },
        { status: "no-path", fromReference: "db#read", toReference: "other#save", path: null },
        { status: "truncated", fromReference: "other#save", toReference: "other#end", path: null }
      ]
    });
    expect(text).toContain("`api#handle` → `service#load` (calls)");
    expect(text).toContain("at `api.ts:8`");
    expect(text).toContain("rule `direct-call`");
    expect(text).toContain("`service#load` → `db#read` (calls)");
    expect(text).toContain("at `service.ts:21`");
    expect(text).toContain("rule `import-call`");
    expect(text).toContain("No exact path found within the search bounds");
    expect(text).toContain("Path search truncated");
  });

  it("discloses source and selection limits even when no source or relationships were emitted", () => {
    const text = renderExploreText({
      queryPlan: { input: { truncated: true }, summary: { truncated: true } },
      connectionsTruncated: true,
      sourceWindowPlan: { summary: { truncated: true, unavailableFileSiteCount: 2 } },
      sourceWindowAllocation: { summary: { truncated: true } },
      pathSpinePlan: { summary: { traversalTruncated: true } },
      source: { filePath: "src/large.ts", startLine: 12, endLine: 80, text: "", lines: [], truncated: true, emittedCharacters: 0, requestedCharacters: 9000 }
    });
    expect(text).toContain("Query text was truncated");
    expect(text).toContain("Focus selection was truncated");
    expect(text).toContain("Additional exact connections were truncated");
    expect(text).toContain("Source windows were limited");
    expect(text).toContain("2 exact call sites are in files outside the current source envelope");
    expect(text).toContain("Path exploration was limited");
    expect(text).toContain("0/9000 characters");
    expect(text).toContain("SymbolLattice file");
    expect(text).not.toContain("12\t");
  });

  it("labels uncertain focus relations and preserves per-focus limits", () => {
    const text = renderExploreText({ focuses: [{
      symbol: { qualifiedName: "api#handle" },
      callers: { items: [], truncated: true },
      callees: { items: [{ symbol: { qualifiedName: "service#load" }, edge: { kind: "calls", resolution: "heuristic", filePath: "api.ts", range: { start: { line: 8 } } } }], truncated: false },
      impact: { paths: [], truncated: true },
      sourceAvailability: "unavailable"
    }] });
    expect(text).toContain("`api#handle` → `service#load` (calls)");
    expect(text).toContain("heuristic");
    expect(text).toContain("Callers were truncated");
    expect(text).toContain("Impact paths were truncated");
    expect(text).toContain("Source unavailable");
  });

  it("renders newly delivered fragments and references prior source without inventing line numbers", () => {
    const text = renderExploreText({ source: {
      filePath: "src/users.ts", startLine: 1, endLine: 100, lines: [], text: null,
      delivery: { status: "partially-served", coveredPointers: [{ display: "src/users.ts:1–5" }], fragments: [
        { text: "return loadUser();", pointer: { display: "src/users.ts:6:3–6:21", range: { start: { line: 6, column: 3 } } } },
        { text: "return fallback();", sourceIdentity: { id: "source:fallback" } }
      ] }
    } });
    expect(text).toContain("partially served");
    expect(text).toContain("src/users.ts:1–5");
    expect(text).toContain("6\treturn loadUser();");
    expect(text).toContain("source:fallback");
    expect(text).toContain("return fallback();");
    expect(text).not.toContain("1\treturn fallback();");
  });

  it("preserves new source across real session overlap and subsequent full reuse", () => {
    const session = new McpSourceSession({ minimumAvoidedCharacters: 1, minimumEmittedCharacters: 1 });
    const sourceText = "export function loadUser() {\n  return database.findUser();\n}";
    const boundary = sourceText.indexOf("\n") + 1;
    const response = (end: number) => {
      const text = sourceText.slice(0, end);
      return { content: [], structuredContent: {
        status: { projectPath: "C:/project", generationId: "generation:1" },
        source: {
          filePath: "src/users.ts", startLine: 1, endLine: 3,
          range: { start: { line: 1, column: 1 }, end: { line: 3, column: 2 } },
          text, lines: text.split("\n").map((text, index) => ({ line: index + 1, text })),
          sourceIdentity: sourceDeliveryIdentityFromText({ filePath: "src/users.ts", text, fullFileCharacterOffsets: { start: 0, end } })
        }
      } };
    };
    session.project(response(boundary), "explore", "deduplicate");
    const partial = session.project(response(sourceText.length), "explore", "deduplicate");
    expect(partial.structuredContent.source).toMatchObject({ text: null, delivery: { status: "partially-served" } });
    const rendered = renderExploreText(partial.structuredContent);
    expect(rendered).toContain("partially served");
    expect(rendered).toContain("database.findUser()");
    expect(rendered).not.toContain("export function loadUser()");
    const reused = session.project(response(sourceText.length), "explore", "deduplicate");
    const reusedText = renderExploreText(reused.structuredContent);
    expect(reusedText).toContain("already served");
    expect(reusedText).toContain("prior source:");
    expect(reusedText).not.toContain("database.findUser()");
  });

  it("keeps a new fragment when a duplicate window only refers to previously served source", () => {
    const range = { filePath: "src/users.ts", startLine: 1, endLine: 5, text: null, lines: [] };
    const text = renderExploreText({
      focuses: [{
        source: { ...range, delivery: { status: "partially-served", fragments: [{ text: "const newEvidence = true;" }] } },
        impact: { paths: [{ symbols: [] }], truncated: false }
      }],
      sourceWindows: [{ source: { ...range, delivery: { status: "already-served", sourceId: "source:old" } } }]
    });
    expect(text).toContain("const newEvidence = true;");
    expect(text).toContain("1 per-focus reverse-impact paths are omitted");
    expect(text).toContain("SymbolLattice explore <query> --json");
  });

  it.each([
    [{ initialized: false, stale: false }, "Index: not initialized"],
    [{ initialized: true }, "Index: freshness unknown"],
    [null, "Index status unavailable"]
  ])("does not present unavailable freshness as up to date: %j", (status, expected) => {
    const text = renderExploreText({ status });
    expect(text).toContain(expected);
    expect(text).not.toContain("up to date");
  });
});
