import { describe, expect, it } from "vitest";
import ts from "typescript";

import {
  DEFAULT_QUOTAS,
  buildNegatives,
  descriptorMatches,
  enclosingSourceGraphOwner,
  isGraphDeclaration,
  isTestSourcePath,
  parseOracleArguments,
  parseOracleManifest,
  oracleExitCode,
  scoreOracleEvidence,
  selectUniquePositiveGroups,
  selectStratified,
  stableSha256
} from "../../../scripts/typescript-large-project-correctness-oracle.mjs";

const endpoint = (name: string, line: number) => ({
  filePath: "src/example.ts", name, kind: "function", range: { start: { line, column: 1 } }, key: `src/example.ts:${line}:1:function:${name}`
});
const truth = (name: string, line: number, occurrenceColumn = 4) => ({ kind: "calls", source: endpoint("source", 1), target: endpoint(name, line), occurrence: { filePath: "src/example.ts", range: { start: { line: 10, column: occurrenceColumn } }, key: `src/example.ts:10:${occurrenceColumn}` }, strata: { sourceRole: "production", layer: "src/example.ts", relationKind: "calls", crossFile: false, declarationKind: "function" }, evidence: { rule: "typescript-compiler-api", stage: "source-derived", resolution: "exact", confidence: 1 } });

describe("typescript large-project correctness oracle", () => {
  it("requires every CLI input that protects source/evidence separation", () => {
    expect(() => parseOracleArguments(["--project", "fixture"])).toThrow("--manifest is required");
    expect(parseOracleArguments(["--project", "fixture", "--manifest", "manifest.json", "--index-evidence", "evidence.json"])).toMatchObject({ project: "fixture", seed: "symbol-lattice-v0.419.0-nest-v11.1.16-stage5" });
  });

  it("keeps quota defaults while allowing a manifest to tighten them", () => {
    expect(parseOracleManifest({ quotas: { callsInstantiates: 3 } }).quotas).toEqual({ ...DEFAULT_QUOTAS, callsInstantiates: 3 });
  });

  it("fails the process contract when scoring has any FP or FN", () => {
    const base = { status: "complete", source: { commitMatches: true }, acceptance: { falsePositives: true, falseNegatives: true, evidenceInvalid: true, unaudited: true } };
    expect(oracleExitCode(base)).toBe(0);
    expect(oracleExitCode({ ...base, acceptance: { ...base.acceptance, falseNegatives: false } })).toBe(2);
  });

  it("selects deterministically across strata and scores only exact evidence", () => {
    const first = { ...truth("one", 2), strata: { ...truth("one", 2).strata, layer: "src/a" } };
    const second = { ...truth("two", 3), strata: { ...truth("two", 3).strata, layer: "src/b" } };
    expect(selectStratified([first, second], 2, "seed")).toHaveLength(2);
    const negatives = buildNegatives({ callsInstantiates: [first] }, { callsInstantiates: [first, second] }, 1, "seed");
    const score = scoreOracleEvidence({ callsInstantiates: [first] }, negatives, { edges: [{ kind: "calls", source: first.source, target: first.target, occurrence: first.occurrence, resolution: "exact", confidence: 1, evidence: { rule: "rule", stage: "stage" } }] });
    expect(score).toMatchObject({ tp: 1, fp: 0, fn: 0, evidenceInvalid: 0, unaudited: 0 });
    expect(scoreOracleEvidence({ callsInstantiates: [first] }, [], { edges: [{ kind: "calls", source: first.source, target: first.target, occurrence: first.occurrence, resolution: "candidate", confidence: 1, evidence: { rule: "rule", stage: "stage" } }] })).toMatchObject({ tp: 0, fn: 1, evidenceInvalid: 1 });
  });

  it("uses persisted symbols as identity evidence without invented edge metadata", () => {
    const identity = { kind: "identity", target: endpoint("identity", 7) };
    expect(scoreOracleEvidence({ identity: [identity] }, [], { symbols: [identity.target], edges: [] })).toMatchObject({ tp: 1, fn: 0, evidenceInvalid: 0 });
  });

  it("matches a compiler name position inside a decorated graph declaration span", () => {
    const expected = endpoint("Decorated", 4);
    const observed = { ...expected, range: { start: { line: 3, column: 1 }, end: { line: 8, column: 2 } } };
    expect(descriptorMatches(expected, observed)).toBe(true);
    expect(descriptorMatches(expected, { ...observed, name: "Other" })).toBe(false);
  });

  it("excludes incidental syntax from graph declarations and resolves arrow owners to their carrier", () => {
    const file = ts.createSourceFile("src/sample.ts", "import { imported } from './dep'; @decorator() class Example { property = () => object.member(); method() { return object.member(); } } const handler = (parameter: string) => object.member(parameter);", ts.ScriptTarget.Latest, true);
    const nodes: ts.Node[] = [];
    const walk = (node: ts.Node): void => { nodes.push(node); ts.forEachChild(node, walk); };
    walk(file);
    const importSpecifier = nodes.find(ts.isImportSpecifier)!;
    const propertyAccess = nodes.find(ts.isPropertyAccessExpression)!;
    const parameter = nodes.find(ts.isParameter)!;
    const variable = nodes.find(ts.isVariableDeclaration)!;
    const property = nodes.find(ts.isPropertyDeclaration)!;
    const decoratorCall = nodes.find((node): node is ts.CallExpression => ts.isCallExpression(node) && node.expression.getText(file) === "decorator")!;
    const propertyCall = nodes.find((node): node is ts.CallExpression => {
      if (!ts.isCallExpression(node) || node.expression.getText(file) !== "object.member") return false;
      let current: ts.Node | undefined = node.parent;
      while (current !== undefined && current !== file) {
        if (current === property) return true;
        current = current.parent;
      }
      return false;
    })!;
    const call = nodes.filter(ts.isCallExpression).at(-1)!;
    expect(isGraphDeclaration(importSpecifier)).toBe(false);
    expect(isGraphDeclaration(propertyAccess)).toBe(false);
    expect(isGraphDeclaration(parameter)).toBe(false);
    expect(isGraphDeclaration(property)).toBe(true);
    expect(isGraphDeclaration(variable)).toBe(true);
    expect(enclosingSourceGraphOwner(call)).toBe(variable);
    expect(enclosingSourceGraphOwner(decoratorCall)).toBe(nodes.find(ts.isClassDeclaration));
    expect(enclosingSourceGraphOwner(propertyCall)).toBe(property);
  });

  it("attributes ordinary local initializers inside an arrow to the represented outer carrier", () => {
    const file = ts.createSourceFile(
      "src/sample.ts",
      "const outer = () => { const local = imported(value); return local; };",
      ts.ScriptTarget.Latest,
      true
    );
    let call: ts.CallExpression | undefined;
    let outer: ts.VariableDeclaration | undefined;
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) call = node;
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === "outer") outer = node;
      ts.forEachChild(node, walk);
    };
    walk(file);
    expect(enclosingSourceGraphOwner(call!)).toBe(outer);
  });

  it("keeps repeated occurrences distinct and uses SHA-256 deterministic ordering", () => {
    const first = truth("same", 2, 4);
    const second = truth("same", 2, 16);
    expect(selectStratified([first, second], 2, "seed").map((item) => item.occurrence.key)).toHaveLength(2);
    expect(stableSha256("seed|one")).toMatch(/^[a-f0-9]{64}$/);
    expect(selectStratified([first, second], 2, "seed")).toEqual(selectStratified([first, second], 2, "seed"));
    expect(isTestSourcePath("src/example.spec.ts")).toBe(true);
    expect(isTestSourcePath("packages/core/test/example.ts")).toBe(true);
    expect(isTestSourcePath("packages/core/e2e/example.ts")).toBe(true);
    expect(isTestSourcePath("src/latest.ts")).toBe(false);
  });

  it("counts each positive truth once even when a cross-layer stratum overlaps", () => {
    const repeated = truth("same", 2, 4);
    const distinct = truth("other", 3, 8);
    const selected = selectUniquePositiveGroups(
      [["callsInstantiates", "callsInstantiates"], ["crossLayerTestImpact", "crossLayerTestImpact"]],
      { callsInstantiates: [repeated], crossLayerTestImpact: [repeated, distinct] },
      { callsInstantiates: 1, crossLayerTestImpact: 1 },
      "seed"
    );
    expect(selected.groups.callsInstantiates).toEqual([repeated]);
    expect(selected.groups.crossLayerTestImpact).toEqual([distinct]);
  });
});
