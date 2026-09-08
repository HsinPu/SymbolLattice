import { basename } from "node:path";

/*
 * This table is the independent minimum truth for the non-empty admission
 * gate.  It is deliberately small: one declaration/resource and one exact
 * containment or language-specific static relation where the product contract
 * exposes one.  It must never be generated from extractFileFacts output.
 */
export const NONEMPTY_EXPECTATIONS = Object.freeze({
  typescript: { symbols: [{ kind: "function", name: "greet" }] },
  javascript: { symbols: [{ kind: "function", name: "greet" }] },
  arkts: { symbols: [{ kind: "class", name: "Sample" }] },
  vue: { symbols: [{ kind: "variable", name: "answer" }] },
  svelte: { symbols: [{ kind: "variable", name: "answer" }] },
  astro: { symbols: [{ kind: "variable", name: "answer" }] },
  razor: { symbols: [{ kind: "route", name: "NAVIGATE /sample" }] },
  python: { symbols: [{ kind: "function", name: "greet" }] },
  go: { symbols: [{ kind: "function", name: "greet" }], relation: { kind: "calls", source: "caller", target: "greet" } },
  rust: { symbols: [{ kind: "function", name: "greet" }], relation: { kind: "calls", source: "caller", target: "greet" } },
  java: { symbols: [{ kind: "class", name: "Sample" }] },
  groovy: { symbols: [{ kind: "function", name: "greet" }] },
  fortran: { symbols: [{ kind: "module", name: "sample" }] },
  ada: { symbols: [{ kind: "function", name: "Sample" }] },
  php: { symbols: [{ kind: "function", name: "greet" }] },
  blade: { relationFact: { field: "bladeFacts.templateReferences", kind: "extends", targetFilePath: "resources/views/layouts/app.blade.php" } },
  c: { symbols: [{ kind: "function", name: "greet" }], relation: { kind: "calls", source: "caller", target: "greet" } },
  lua: { symbols: [{ kind: "function", name: "greet" }] },
  luau: { symbols: [{ kind: "function", name: "greet" }] },
  pascal: { symbols: [{ kind: "function", name: "Greet" }] },
  objc: { symbols: [{ kind: "class", name: "Sample" }] },
  r: { symbols: [{ kind: "function", name: "greet" }] },
  elixir: { symbols: [{ kind: "class", name: "Sample" }] },
  erlang: { symbols: [{ kind: "class", name: "sample" }] },
  clojure: { symbols: [{ kind: "class", name: "sample" }] },
  perl: { symbols: [{ kind: "function", name: "greet" }] },
  julia: { symbols: [{ kind: "function", name: "greet" }] },
  haskell: { symbols: [{ kind: "module", name: "Sample" }] },
  ocaml: { symbols: [{ kind: "function", name: "greet" }] },
  fsharp: { symbols: [{ kind: "module", name: "Sample" }] },
  nim: { symbols: [{ kind: "function", name: "greet" }] },
  cpp: { symbols: [{ kind: "function", name: "greet" }], relation: { kind: "calls", source: "caller", target: "greet" } },
  csharp: { symbols: [{ kind: "class", name: "Sample" }] },
  ruby: { symbols: [{ kind: "function", name: "greet" }] },
  kotlin: { symbols: [{ kind: "function", name: "greet" }], relation: { kind: "calls", source: "caller", target: "greet" } },
  swift: { symbols: [{ kind: "function", name: "greet" }] },
  dart: { symbols: [{ kind: "function", name: "greet" }], relation: { kind: "calls", source: "caller", target: "greet" } },
  scala: { symbols: [{ kind: "class", name: "Sample" }] },
  terraform: { symbols: [{ kind: "resource", name: "resource demo.main" }] },
  liquid: { relationFact: { field: "liquidFacts.templateReferences", kind: "render", targetFilePath: "snippets/product-card.liquid" } },
  twig: { relationFact: { field: "twigFacts.templateReferences", kind: "extends", targetFilePath: "templates/base.html.twig" } },
  solidity: { symbols: [{ kind: "class", name: "Sample" }] },
  cfml: { symbols: [{ kind: "class", name: "sample" }] },
  nix: { symbols: [{ kind: "variable", name: "greeting" }] },
  vbnet: { symbols: [{ kind: "module", name: "Sample" }] },
  cobol: { symbols: [{ kind: "module", name: "SAMPLE" }] },
  zig: { symbols: [{ kind: "function", name: "greet" }], relation: { kind: "calls", source: "caller", target: "greet" } },
  yaml: { symbols: [{ kind: "variable", name: "service" }] },
  xml: { symbols: [{ kind: "resource", name: "root" }] },
  html: { symbols: [{ kind: "resource", name: "html" }] },
  jsp: { symbols: [{ kind: "resource", name: "directive:page" }] },
  css: { symbols: [{ kind: "resource", name: ".card", qualifiedName: "sample.css#css-rule[1]:.card" }] },
  properties: { symbols: [{ kind: "variable", name: "app.name" }] },
  shell: { symbols: [{ kind: "function", name: "greet" }] },
  sql: { symbols: [{ kind: "resource", name: "users" }] },
  graphql: { symbols: [{ kind: "class", name: "User" }] },
  proto: { symbols: [{ kind: "class", name: "User" }] },
  markdown: { symbols: [{ kind: "resource", name: "Sample" }] }
});

function symbolMatches(symbol, expected) {
  return (
    symbol?.kind === expected.kind &&
    symbol?.name === expected.name &&
    (expected.qualifiedName === undefined || symbol.qualifiedName === expected.qualifiedName)
  );
}

function sourceFileSymbol(facts, fixture) {
  const fileName = basename(fixture.filePath);
  return facts.symbols.filter((symbol) =>
    symbol.kind === "file" && symbol.name === fileName && symbol.filePath === fixture.filePath
  );
}

function rangeIsValid(range, sourceText) {
  if (range === undefined || range === null) return false;
  const startLine = range.start?.line;
  const startColumn = range.start?.column;
  const endLine = range.end?.line;
  const endColumn = range.end?.column;
  if (![startLine, startColumn, endLine, endColumn].every(Number.isInteger)) return false;
  // Existing extractors expose both zero- and one-based columns. This is a
  // compatibility bounds check, not proof of a normalized occurrence offset.
  if (startLine < 1 || endLine < 1 || startColumn < 0 || endColumn < 0) return false;
  const lines = sourceText.split(/\r?\n/u);
  if (startLine > lines.length || endLine > lines.length) return false;
  if (startColumn > lines[startLine - 1].length + 1 || endColumn > lines[endLine - 1].length + 1) return false;
  return endLine > startLine || (endLine === startLine && endColumn >= startColumn);
}

function relationMatches(facts, relation, fixture) {
  const sourceMatches = facts.symbols.filter((symbol) => symbol.name === relation.source);
  const targetMatches = facts.symbols.filter((symbol) => symbol.name === relation.target);
  if (sourceMatches.length !== 1 || targetMatches.length !== 1) {
    return { ok: false, error: `relation endpoint is not unique: ${relation.source} -> ${relation.target}` };
  }
  const source = sourceMatches[0];
  const target = targetMatches[0];
  const matches = facts.edges.filter((edge) =>
    edge.kind === relation.kind && edge.sourceId === source.id && edge.targetId === target.id
  );
  if (matches.length !== 1) {
    return { ok: false, error: `expected one ${relation.kind} edge: ${relation.source} -> ${relation.target}` };
  }
  const edge = matches[0];
  if (edge.resolution !== "exact" || edge.confidence !== 1 ||
      edge.evidence?.candidateSymbolIds?.length !== 1 ||
      edge.evidence.candidateSymbolIds[0] !== target.id ||
      edge.filePath !== fixture.filePath || !rangeIsValid(edge.range, fixture.sourceText)) {
    return { ok: false, error: `relation is not exact: ${relation.kind} ${relation.source} -> ${relation.target}` };
  }
  return { ok: true };
}

function relationFactMatches(facts, expected) {
  const [factName, field] = expected.field.split(".");
  const container = facts[factName];
  const values = container?.[field];
  if (!Array.isArray(values)) {
    return { ok: false, error: `missing fact collection: ${expected.field}` };
  }
  const matches = values.filter((value) =>
    value.kind === expected.kind && value.targetFilePath === expected.targetFilePath
  );
  return matches.length === 1
    ? { ok: true }
    : { ok: false, error: `expected one ${expected.kind} fact to ${expected.targetFilePath}` };
}

/** Score one fixture against its independent minimum contract. */
export function scoreNonEmptyFixture(fixture, facts) {
  const expected = NONEMPTY_EXPECTATIONS[fixture.language];
  const errors = [];
  if (expected === undefined) errors.push(`missing expectation for ${fixture.language}`);
  if (expected !== undefined && !(expected.symbols?.length > 0 || expected.relationFact)) {
    errors.push("expectation must require a declaration/resource or a template reference");
  }
  if (fixture.sourceText.trim().length === 0) errors.push("sourceText must be non-empty");
  const files = sourceFileSymbol(facts, fixture);
  if (files.length !== 1) errors.push("expected exactly one file symbol");
  for (const symbol of facts.symbols) {
    if (symbol.filePath !== fixture.filePath) errors.push(`wrong symbol file: ${symbol.kind}:${symbol.name}`);
    if (!rangeIsValid(symbol.range, fixture.sourceText)) errors.push(`invalid symbol range: ${symbol.kind}:${symbol.name}`);
  }
  for (const expectedSymbol of expected?.symbols ?? []) {
    const matches = facts.symbols.filter((symbol) => symbolMatches(symbol, expectedSymbol));
    if (matches.length !== 1) errors.push(`expected one ${expectedSymbol.kind}:${expectedSymbol.name}`);
  }
  if ((expected?.symbols?.length ?? 0) > 0) {
    const declarationTargets = expected.symbols
      .map((expectedSymbol) => facts.symbols.find((symbol) => symbolMatches(symbol, expectedSymbol)))
      .filter((symbol) => symbol !== undefined);
    const file = files[0];
    for (const target of declarationTargets) {
      const containment = facts.edges.filter((edge) =>
        edge.kind === "contains" && edge.sourceId === file?.id && edge.targetId === target.id
      );
      if (containment.length !== 1 || containment[0]?.resolution !== "exact" || containment[0]?.confidence !== 1 ||
          containment[0]?.evidence?.candidateSymbolIds?.length !== 1 ||
          containment[0]?.evidence?.candidateSymbolIds?.[0] !== target.id ||
          containment[0]?.filePath !== fixture.filePath || !rangeIsValid(containment[0]?.range, fixture.sourceText)) {
        errors.push(`missing exact containment for ${target.kind}:${target.name}`);
      }
    }
  }
  if (expected?.relation !== undefined) {
    const relation = relationMatches(facts, expected.relation, fixture);
    if (!relation.ok) errors.push(relation.error);
  }
  if (expected?.relationFact !== undefined) {
    const relation = relationFactMatches(facts, expected.relationFact);
    if (!relation.ok) errors.push(relation.error);
  }
  return { language: fixture.language, accepted: errors.length === 0, admission: "supported", errors };
}

/** Score all 58 fixtures without deriving any expectation from product facts. */
export function scoreNonEmptyFixtures(fixtures, extractFacts) {
  const rows = fixtures.map((fixture) => {
    try {
      const facts = extractFacts(fixture);
      return scoreNonEmptyFixture(fixture, facts);
    } catch (error) {
      return {
        language: fixture.language,
        accepted: false,
        admission: NONEMPTY_EXPECTATIONS[fixture.language]?.admission ?? "supported",
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  });
  const supportedRows = rows.filter((row) => row.admission === "supported");
  const knownFileOnlyRows = rows.filter((row) => row.admission === "known-file-only");
  return {
    rows,
    languageCount: rows.length,
    supportedCount: supportedRows.filter((row) => row.accepted).length,
    supportedFailures: supportedRows.filter((row) => !row.accepted),
    knownFileOnlyCount: knownFileOnlyRows.length,
    knownFileOnlyFailures: knownFileOnlyRows.filter((row) => !row.accepted),
    acceptedCount: rows.filter((row) => row.accepted).length,
    strictPassed: rows.length > 0 && rows.every((row) => row.accepted) && knownFileOnlyRows.length === 0,
    passed: rows.length > 0 && rows.every((row) => row.accepted)
  };
}
