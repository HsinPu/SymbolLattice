import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

function document(relativePath: string, sourceText: string): SourceDocument {
  return {
    absolutePath: `C:/project/${relativePath}`,
    relativePath,
    language: "typescript",
    sourceText,
    contentHash: `test:${relativePath}:${sourceText.length}`
  };
}

function snapshot(files: Readonly<Record<string, string>>) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) =>
    document(relativePath, sourceText)
  );
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((sourceDocument) =>
      extractFileFacts({
        filePath: sourceDocument.relativePath,
        language: sourceDocument.language,
        sourceText: sourceDocument.sourceText
      })
    ),
    indexedAt: "2026-08-14T00:00:00.000Z"
  });
}

describe("TypeScript self-hosting relation depth", () => {
  it("retains interface property identities and attributes arrow-body calls to the arrow variable", () => {
    const facts = extractFileFacts({
      filePath: "src/watch.ts",
      language: "typescript",
      sourceText: [
        "interface Selection { readonly pathPrefix?: string; }",
        "function helper(): void {}",
        "class WatchSource {",
        "  subscribe(): void {",
        "    const onChange = (): void => { helper(); };",
        "  }",
        "}"
      ].join("\n")
    });

    const pathPrefix = facts.symbols.find(
      (symbol) => symbol.kind === "variable" && symbol.qualifiedName === "src/watch.ts#Selection.pathPrefix"
    );
    const onChange = facts.symbols.find(
      (symbol) => symbol.kind === "variable" && symbol.qualifiedName === "src/watch.ts#WatchSource.subscribe.onChange"
    );
    const subscribe = facts.symbols.find(
      (symbol) => symbol.kind === "method" && symbol.qualifiedName === "src/watch.ts#WatchSource.subscribe"
    );
    const helperCall = facts.pendingReferences.find(
      (reference) => reference.relationKind === "calls" && reference.referenceName === "helper"
    );

    expect(pathPrefix).toBeDefined();
    expect(onChange).toBeDefined();
    expect(helperCall?.sourceId).toBe(onChange?.id);
    expect(helperCall?.sourceId).not.toBe(subscribe?.id);
  });

  it("does not classify a callback argument as a direct call", () => {
    const facts = extractFileFacts({
      filePath: "src/sort.ts",
      language: "typescript",
      sourceText: [
        "function compare(left: number, right: number): number { return left - right; }",
        "export function sortValues(values: number[]): void { values.sort(compare); }"
      ].join("\n")
    });

    expect(
      facts.pendingReferences.filter(
        (reference) => reference.relationKind === "calls" && reference.referenceName === "compare"
      )
    ).toEqual([]);
  });

  it("retains the proven const-array sort callback edge", () => {
    const graph = snapshot({
      "src/sort.ts": [
        "function compare(left: number, right: number): number { return left - right; }",
        "export function sortValues(): void { const values = []; values.sort(compare); }"
      ].join("\n")
    });
    const compare = graph.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "src/sort.ts#compare"
    );
    const sortValues = graph.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "src/sort.ts#sortValues"
    );

    const comparatorEdges = graph.edges.filter(
      (edge) =>
        edge.kind === "calls" &&
        edge.sourceId === sortValues?.id &&
        edge.targetId === compare?.id &&
        edge.resolution === "exact"
    );

    expect(comparatorEdges).toHaveLength(1);
    expect(comparatorEdges[0]?.evidence?.ruleId).toBe("syntax.typescript.array-sort-comparator");
  });

  it("retains specialized comparator evidence for an imported Array.sort callback", () => {
    const files = {
      "src/comparator.ts":
        "export function compareProjectPaths(left: string, right: string): number { return left.localeCompare(right); }",
      "src/configuration-discovery.ts": [
        'import { compareProjectPaths } from "./comparator.js";',
        "export function sortPaths(): void { const paths = []; paths.sort(compareProjectPaths); }"
      ].join("\n")
    };
    const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) =>
      document(relativePath, sourceText)
    );
    const extractedFiles = sourceDocuments.map((sourceDocument) =>
      extractFileFacts({
        filePath: sourceDocument.relativePath,
        language: sourceDocument.language,
        sourceText: sourceDocument.sourceText
      })
    );
    const consumerFacts = extractedFiles.find(
      (facts) => facts.symbols.some((symbol) => symbol.filePath === "src/configuration-discovery.ts")
    );
    const specializedReference = consumerFacts?.pendingReferences.find(
      (reference) => reference.callSemantics === "typescript-array-sort-comparator"
    );
    expect(specializedReference).toBeDefined();
    const { callSemantics: _callSemantics, ...genericReference } = specializedReference!;
    const graph = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: extractedFiles.map((facts) =>
        facts === consumerFacts
          ? { ...facts, pendingReferences: [...facts.pendingReferences, genericReference] }
          : facts
      ),
      indexedAt: "2026-08-14T00:00:00.000Z"
    });
    const compareProjectPaths = graph.symbols.find(
      (symbol) =>
        symbol.kind === "function" && symbol.qualifiedName === "src/comparator.ts#compareProjectPaths"
    );
    const sortPaths = graph.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "src/configuration-discovery.ts#sortPaths"
    );
    const comparatorEdges = graph.edges.filter(
      (edge) =>
        edge.kind === "calls" &&
        edge.sourceId === sortPaths?.id &&
        edge.targetId === compareProjectPaths?.id &&
        edge.resolution === "exact"
    );

    expect(comparatorEdges).toHaveLength(1);
    expect(comparatorEdges[0]?.evidence?.ruleId).toBe("syntax.typescript.array-sort-comparator");
    expect(
      comparatorEdges.some((edge) => edge.evidence?.ruleId === "module.explicit-import-binding")
    ).toBe(false);
  });

  it("resolves only statically proven TypeScript member-call receivers", () => {
    const graph = snapshot({
      "src/catalog.ts": [
        "export interface Callbacks { onChange(event: unknown): void; }",
        "export class Catalog { scan(): void {} verifyFreshness(): void {} }"
      ].join("\n"),
      "src/consumer.ts": [
        'import { Catalog, type Callbacks } from "./catalog.js";',
        "export class Registry {",
        "  register(callbacks: Callbacks): void {",
        "    this.recordPath();",
        "    callbacks.onChange({});",
        "    const catalog = new Catalog();",
        "    catalog.scan();",
        "    new Catalog().verifyFreshness();",
        "  }",
        "  private recordPath(): void {}",
        "}",
        "export function rank(input: { filePath(value: unknown): string }): string {",
        "  return input.filePath({});",
        "}"
      ].join("\n")
    });

    const calls = graph.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    const exactTargets = calls.map((edge) =>
      graph.symbols.find((symbol) => symbol.id === edge.targetId)?.qualifiedName
    );

    expect(exactTargets).toEqual(
      expect.arrayContaining([
        "src/consumer.ts#Registry.recordPath",
        "src/catalog.ts#Callbacks.onChange",
        "src/catalog.ts#Catalog.scan",
        "src/catalog.ts#Catalog.verifyFreshness",
        "src/consumer.ts#rank.filePath"
      ])
    );
    expect(calls.filter((edge) => edge.evidence?.ruleId === "syntax.typescript.proven-receiver-member-call")).toHaveLength(5);
  });

  it("fails closed for mutable, optional, computed, or reassigned member-call receivers", () => {
    const graph = snapshot({
      "src/catalog.ts": "export class Catalog { scan(): void {} }",
      "src/consumer.ts": [
        'import { Catalog } from "./catalog.js";',
        "export function unsafe(): void {",
        "  let mutable = new Catalog();",
        "  mutable = new Catalog();",
        "  mutable.scan();",
        "  const stable = new Catalog();",
        "  stable.scan?.();",
        '  stable["scan"]();',
        "  stable.scan = () => undefined;",
        "}"
      ].join("\n")
    });

    expect(
      graph.edges.filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.referenceName === "scan" &&
          edge.resolution === "exact"
      )
    ).toEqual([]);
  });

  it("keeps identifier property declarations as contained variable symbols and rejects private or computed names", () => {
    const facts = extractFileFacts({
      filePath: "src/properties.ts",
      language: "typescript",
      sourceText: [
        "class PropertyOwner {",
        "  public label: string = \"\";",
        "  #secret = 1;",
        "  [\"computed\"] = 2;",
        "}"
      ].join("\n")
    });

    const owner = facts.symbols.find(
      (symbol) => symbol.kind === "class" && symbol.qualifiedName === "src/properties.ts#PropertyOwner"
    );
    const label = facts.symbols.find(
      (symbol) => symbol.kind === "variable" && symbol.qualifiedName === "src/properties.ts#PropertyOwner.label"
    );

    expect(label).toMatchObject({ name: "label", declarationOrdinal: 0 });
    expect(
      facts.edges.some(
        (edge) => edge.kind === "contains" && edge.sourceId === owner?.id && edge.targetId === label?.id
      )
    ).toBe(true);
    expect(facts.symbols.some((symbol) => symbol.name === "secret" || symbol.name === "computed")).toBe(false);
  });

  it("projects explicit this return annotations only to their enclosing named type", () => {
    const facts = extractFileFacts({
      filePath: "src/fluent.ts",
      language: "typescript",
      sourceText: [
        "interface Fluent { chain(): this; }",
        "class Builder { build(): this { return this; } inferred() { return this; } }"
      ].join("\n")
    });
    const fluent = facts.symbols.find((symbol) => symbol.qualifiedName === "src/fluent.ts#Fluent");
    const builder = facts.symbols.find((symbol) => symbol.qualifiedName === "src/fluent.ts#Builder");
    const returns = facts.edges.filter((edge) => edge.kind === "returns" && edge.resolution === "exact");

    expect(returns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: fluent?.id, referenceName: "this", confidence: 1 }),
        expect.objectContaining({ targetId: builder?.id, referenceName: "this", confidence: 1 })
      ])
    );
    expect(returns).toHaveLength(2);
    expect(returns.every((edge) => edge.evidence?.ruleId === "syntax.typescript.explicit-this-return-type")).toBe(true);
  });

  it("resolves direct named-import static calls and readonly constructor parameter-property calls only", () => {
    const graph = snapshot({
      "src/dependency.ts": "export class Dependency { run(): void {} static create(): void {} }",
      "src/consumer.ts": [
        'import { Dependency, Dependency as ImportedDependency } from "./dependency.js";',
        "export class Consumer {",
        "  constructor(private readonly dependency: Dependency) {}",
        "  execute(): void { ImportedDependency.create(); this.dependency.run(); }",
        "}",
        "export class Unsafe {",
        "  constructor(private dependency: Dependency) {}",
        "  execute(): void { this.dependency.run(); }",
        "}",
        "export class Reassigned {",
        "  constructor(private readonly dependency: Dependency) { this.dependency = new Dependency(); }",
        "  execute(): void { this.dependency.run(); }",
        "}",
        "export class DeclaredProperty {",
        "  private readonly dependency: Dependency = new Dependency();",
        "  execute(): void { this.dependency.run(); }",
        "}",
        "export class MutatedMember {",
        "  constructor(private readonly dependency: Dependency) { this.dependency.run = (): void => undefined; }",
        "  execute(): void { this.dependency.run(); }",
        "}",
        "export function shadow(): void {",
        "  const ImportedDependency = { create: (): void => undefined };",
        "  ImportedDependency.create();",
        "}"
      ].join("\n")
    });
    const exactCalls = graph.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    const targets = exactCalls.map((edge) => graph.symbols.find((symbol) => symbol.id === edge.targetId)?.qualifiedName);

    expect(targets).toEqual(
      expect.arrayContaining([
        "src/dependency.ts#Dependency.create",
        "src/dependency.ts#Dependency.run"
      ])
    );
    expect(
      exactCalls.some(
        (edge) =>
          graph.symbols.find((symbol) => symbol.id === edge.sourceId)?.qualifiedName ===
            "src/consumer.ts#Unsafe.execute" &&
          edge.referenceName === "run"
      )
    ).toBe(false);
    expect(
      exactCalls.some((edge) => {
        const source = graph.symbols.find((symbol) => symbol.id === edge.sourceId)?.qualifiedName;
        return (
          (source === "src/consumer.ts#Reassigned.execute" ||
            source === "src/consumer.ts#DeclaredProperty.execute" ||
            source === "src/consumer.ts#MutatedMember.execute" ||
            source === "src/consumer.ts#shadow") &&
          (edge.referenceName === "run" || edge.referenceName === "create")
        );
      })
    ).toBe(false);
  });

  it("uses one exact acyclic heritage chain for typed parameter member calls and rejects ambiguity", () => {
    const graph = snapshot({
      "src/contracts.ts": [
        "export interface Base { run(): void; }",
        "export interface Child extends Base {}",
        "export interface Left { collide(): void; }",
        "export interface Right { collide(): void; }",
        "export interface Ambiguous extends Left, Right {}"
      ].join("\n"),
      "src/consumer.ts": [
        'import type { Child, Ambiguous } from "./contracts.js";',
        "export function use(value: Child): void { value.run(); }",
        "export function unsafe(value: Ambiguous): void { value.collide(); }"
      ].join("\n")
    });
    const exactCalls = graph.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");

    expect(
      exactCalls.some(
        (edge) => graph.symbols.find((symbol) => symbol.id === edge.targetId)?.qualifiedName === "src/contracts.ts#Base.run"
      )
    ).toBe(true);
    expect(
      exactCalls.some(
        (edge) =>
          graph.symbols.find((symbol) => symbol.id === edge.sourceId)?.qualifiedName ===
            "src/consumer.ts#unsafe" &&
          edge.referenceName === "collide"
      )
    ).toBe(false);
  });

  it("does not let lexical class or type-parameter shadows resolve to an imported receiver", () => {
    const graph = snapshot({
      "src/catalog.ts": "export class Catalog { scan(): void {} }",
      "src/consumer.ts": [
        'import { Catalog } from "./catalog.js";',
        "export function localShadow(): void {",
        "  class Catalog { scan(): void {} }",
        "  new Catalog().scan();",
        "}",
        "export function generic<Catalog extends { scan(): void }>(value: Catalog): void {",
        "  value.scan();",
        "}"
      ].join("\n")
    });
    const importedScan = graph.symbols.find(
      (symbol) => symbol.kind === "method" && symbol.qualifiedName === "src/catalog.ts#Catalog.scan"
    );
    const shadowedCallers = new Set(
      graph.symbols
        .filter(
          (symbol) =>
            symbol.qualifiedName === "src/consumer.ts#localShadow" ||
            symbol.qualifiedName === "src/consumer.ts#generic"
        )
        .map((symbol) => symbol.id)
    );

    expect(
      graph.edges.some(
        (edge) =>
          edge.kind === "calls" &&
          edge.resolution === "exact" &&
          edge.targetId === importedScan?.id &&
          shadowedCallers.has(edge.sourceId)
      )
    ).toBe(false);
  });

  it("uses explicit non-arrow this types while preserving lexical arrow this", () => {
    const graph = snapshot({
      "src/this-boundaries.ts": [
        "class Other { act(): void {} }",
        "class Outer {",
        "  act(): void {}",
        "  run(): void {",
        "    function nested(this: Other): void { this.act(); }",
        "    function structural(this: { act(): void }): void { this.act(); }",
        "    const arrow = (): void => { this.act(); };",
        "    nested.call(new Other());",
        "    structural.call(new Other());",
        "    arrow();",
        "  }",
        "}"
      ].join("\n")
    });
    const exactCalls = graph.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    const nested = graph.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "src/this-boundaries.ts#Outer.run.nested"
    );
    const arrow = graph.symbols.find(
      (symbol) => symbol.kind === "variable" && symbol.qualifiedName === "src/this-boundaries.ts#Outer.run.arrow"
    );
    const structural = graph.symbols.find(
      (symbol) =>
        symbol.kind === "function" &&
        symbol.qualifiedName === "src/this-boundaries.ts#Outer.run.structural"
    );
    const otherAct = graph.symbols.find((symbol) => symbol.qualifiedName === "src/this-boundaries.ts#Other.act");
    const outerAct = graph.symbols.find((symbol) => symbol.qualifiedName === "src/this-boundaries.ts#Outer.act");

    expect(exactCalls.some((edge) => edge.sourceId === nested?.id && edge.targetId === otherAct?.id)).toBe(true);
    expect(exactCalls.some((edge) => edge.sourceId === nested?.id && edge.targetId === outerAct?.id)).toBe(false);
    expect(exactCalls.some((edge) => edge.sourceId === structural?.id && edge.targetId === outerAct?.id)).toBe(false);
    expect(exactCalls.some((edge) => edge.sourceId === arrow?.id && edge.targetId === outerAct?.id)).toBe(true);
  });

  it("resolves new-expression receivers in value space before local type-only shadows", () => {
    const sourceText = [
      "class Catalog { scan(): void {} }",
      "function create(): void {",
      "  interface Catalog { scan(): void; }",
      "  new Catalog().scan();",
      "}"
    ].join("\n");
    const facts = extractFileFacts({
      filePath: "src/value-space.ts",
      language: "typescript",
      sourceText
    });
    const graph = snapshot({
      "src/value-space.ts": sourceText
    });
    const create = graph.symbols.find(
      (symbol) => symbol.kind === "function" && symbol.qualifiedName === "src/value-space.ts#create"
    );
    const valueScan = graph.symbols.find(
      (symbol) => symbol.kind === "method" && symbol.qualifiedName === "src/value-space.ts#Catalog.scan"
    );
    const typeOnlyScan = graph.symbols.find(
      (symbol) =>
        symbol.kind === "method" && symbol.qualifiedName === "src/value-space.ts#create.Catalog.scan"
    );
    const exactCalls = graph.edges.filter(
      (edge) => edge.kind === "calls" && edge.resolution === "exact" && edge.sourceId === create?.id
    );

    expect(
      facts.pendingReferences.find(
        (reference) => reference.relationKind === "calls" && reference.referenceName === "scan"
      )?.callReceiverBindingSpace
    ).toBe("value");
    expect(exactCalls.some((edge) => edge.targetId === valueScan?.id)).toBe(true);
    expect(exactCalls.some((edge) => edge.targetId === typeOnlyScan?.id)).toBe(false);
  });
});
