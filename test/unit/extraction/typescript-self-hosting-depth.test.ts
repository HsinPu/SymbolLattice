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

  it("attributes calls in a nested named function to that function instead of an outer arrow variable", () => {
    const graph = snapshot({
      "src/nested.ts": [
        "function helper(): void {}",
        "export const outer = (): void => {",
        "  function inner(): void { helper(); }",
        "  inner();",
        "};"
      ].join("\n")
    });
    const helper = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/nested.ts#helper"
    );
    const outer = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/nested.ts#outer"
    );
    const inner = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/nested.ts#outer.inner"
    );
    const helperCalls = graph.edges.filter(
      (edge) =>
        edge.kind === "calls" &&
        edge.targetId === helper?.id &&
        edge.resolution === "exact"
    );

    expect(helperCalls).toHaveLength(1);
    expect(helperCalls[0]?.sourceId).toBe(inner?.id);
    expect(helperCalls[0]?.sourceId).not.toBe(outer?.id);
  });

  it("attributes anonymous callback calls to the nearest representable callable", () => {
    const graph = snapshot({
      "src/callback.ts": [
        "function compareText(left: string, right: string): number {",
        "  return left.localeCompare(right);",
        "}",
        "function pairCandidates(values: string[]): string[] {",
        "  const ordered = [...values].sort((left, right) => compareText(left, right));",
        "  return ordered;",
        "}"
      ].join("\n")
    });
    const compareText = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/callback.ts#compareText"
    );
    const pairCandidates = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/callback.ts#pairCandidates"
    );
    const compareCalls = graph.edges.filter(
      (edge) =>
        edge.kind === "calls" &&
        edge.targetId === compareText?.id &&
        edge.resolution === "exact"
    );

    expect(compareCalls).toHaveLength(1);
    expect(compareCalls[0]?.sourceId).toBe(pairCandidates?.id);
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

  it.each([
    "values.sort = (): never[] => [];",
    "const alias = values; alias.sort = (): never[] => [];",
    "declare function mutate(value: unknown): void; mutate(values);",
    "Array.prototype.sort = function replacement(): never[] { return []; };",
    'Object.defineProperty(Array.prototype, "sort", { value(): never[] { return []; } });'
  ])("suppresses the Array.sort comparator edge after runtime mutation: %s", (mutation) => {
    const graph = snapshot({
      "src/mutated-sort.ts": [
        "function compare(left: number, right: number): number { return left - right; }",
        "export function sortValues(): void {",
        "  const values = [];",
        `  ${mutation}`,
        "  values.sort(compare);",
        "}"
      ].join("\n")
    });

    expect(
      graph.edges.filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.referenceName === "compare" &&
          edge.resolution === "exact"
      )
    ).toEqual([]);
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
        "export class Catalog { scan(): void {} verifyFreshness(): object { return {}; } }"
      ].join("\n"),
      "src/consumer.ts": [
        'import { Catalog, type Callbacks } from "./catalog.js";',
        "export class Registry {",
        "  register(callbacks: Callbacks): void {",
        "    this.recordPath();",
        "    callbacks.onChange({});",
        "    const catalog = new Catalog();",
        "    catalog.scan();",
        "    const freshness = new Catalog().verifyFreshness();",
        "    observe(freshness);",
        "  }",
        "  private recordPath(): void {}",
        "}",
        "declare function observe(value: unknown): void;",
        "export function rank(input: { filePath(value: unknown): string; limit?: number }): string {",
        "  const limit = input.limit ?? 1;",
        "  void limit;",
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

  it("fails closed for member calls after indirect, prototype, or alias mutation", () => {
    const graph = snapshot({
      "src/catalog.ts": "export class Catalog { scan(): void {} }",
      "src/consumer.ts": [
        'import { Catalog } from "./catalog.js";',
        "export function unsafe(): void {",
        "  const assigned = new Catalog();",
        "  Object.assign(assigned, { scan(): void {} });",
        "  assigned.scan();",
        "  Catalog.prototype.scan = (): void => undefined;",
        "  new Catalog().scan();",
        "  const aliased = new Catalog();",
        "  const alias = aliased;",
        "  alias.scan = (): void => undefined;",
        "  aliased.scan();",
        "}",
        "export class NestedUnsafe {",
        "  execute(): void {",
        "    const nested = new Catalog();",
        "    Object.assign(nested, { scan(): void {} });",
        "    nested.scan();",
        "  }",
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

  it.each([
    ["direct", "Catalog"],
    ["parenthesized", "(Catalog)"],
    ["as assertion", "Catalog as typeof Catalog"],
    ["type assertion", "<typeof Catalog>Catalog"],
    ["satisfies expression", "Catalog satisfies typeof Catalog"],
    ["non-null assertion", "Catalog!"],
    ["nested transparent", "((Catalog as typeof Catalog)!)"]
  ])("fails closed when a %s constructor alias mutates the original prototype", (_label, aliasExpression) => {
    const graph = snapshot({
      "src/catalog.ts": [
        "export class Catalog { scan(): void {} }",
        `const CatalogAlias = ${aliasExpression};`,
        "CatalogAlias.prototype.scan = function replacement(): void {};",
        "export function run(): void { new Catalog().scan(); }"
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

  it.each([
    ["parenthesized prototype", "(CatalogAlias).prototype.scan = function replacement(): void {};"],
    ["asserted prototype", "(CatalogAlias as typeof Catalog).prototype.scan = function replacement(): void {};"],
    ["non-null prototype", "CatalogAlias!.prototype.scan = function replacement(): void {};"],
    [
      "mutation call prototype",
      'Object.defineProperty((CatalogAlias).prototype, "scan", { value(): void {} });'
    ]
  ])("fails closed for a %s mutation receiver", (_label, mutation) => {
    const graph = snapshot({
      "src/catalog.ts": [
        "export class Catalog { scan(): void {} }",
        "const CatalogAlias = Catalog;",
        mutation,
        "export function run(): void { new Catalog().scan(); }"
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

  it.each([
    ["parenthesized instance", "(alias).scan = function replacement(): void {};"],
    ["mutation call instance", "Object.assign((alias), { scan(): void {} });"]
  ])("fails closed for a %s alias mutation receiver", (_label, mutation) => {
    const graph = snapshot({
      "src/catalog.ts": [
        "export class Catalog { scan(): void {} }",
        "export function run(): void {",
        "  const original = new Catalog();",
        "  const alias = original;",
        `  ${mutation}`,
        "  original.scan();",
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

  it.each([
    ["computed prototype assignment", '(Alias)["prototype"].scan = function replacement(): void {};'],
    [
      "computed prototype mutation target",
      'Object.defineProperty((Alias)["prototype"], "scan", { value(): void {} });'
    ],
    [
      "computed mutation helper",
      'Object["defineProperty"](Alias.prototype, "scan", { value(): void {} });'
    ],
    [
      "computed Reflect mutation helper",
      'Reflect["set"](Alias.prototype, "scan", function replacement(): void {});'
    ],
    [
      "prototype object alias",
      "const prototypeAlias = Alias.prototype; prototypeAlias.scan = function replacement(): void {};"
    ],
    [
      "parenthesized whole prototype",
      "(Alias.prototype).scan = function replacement(): void {};"
    ],
    [
      "parenthesized prototype mutation target",
      'Object.defineProperty((Alias.prototype), "scan", { value(): void {} });'
    ],
    [
      "parenthesized prototype alias",
      "const prototypeAlias = (Alias.prototype); prototypeAlias.scan = function replacement(): void {};"
    ],
    [
      "unknown computed method",
      'const method = "scan" as const; Alias.prototype[method] = function replacement(): void {};'
    ],
    [
      "destructured prototype alias",
      "const { prototype: prototypeAlias } = Alias; prototypeAlias.scan = function replacement(): void {};"
    ],
    [
      "prototype passed to helper alias",
      'const define = Object.defineProperty; define(Alias.prototype, "scan", { value(): void {} });'
    ],
    [
      "assignment-destructured prototype alias",
      "let prototypeAlias: any; ({ prototype: prototypeAlias } = Alias); prototypeAlias.scan = function replacement(): void {};"
    ],
    [
      "computed prototype key",
      'const prototypeKey = "prototype" as const; Alias[prototypeKey].scan = function replacement(): void {};'
    ],
    [
      "asserted computed prototype key",
      'const prototypeKey = "prototype" as string; (Alias as any)[prototypeKey].scan = function replacement(): void {};'
    ],
    [
      "helper-derived prototype",
      "function prototypeOf(ctor: typeof Catalog): Catalog { return ctor.prototype; } prototypeOf(Alias).scan = function replacement(): void {};"
    ],
    [
      "computed prototype helper target",
      'const prototypeKey = "prototype" as const; Object.defineProperty(Alias[prototypeKey], "scan", { value(): void {} });'
    ],
    [
      "computed destructured prototype alias",
      'const { ["prototype"]: prototypeAlias } = Alias; prototypeAlias.scan = function replacement(): void {};'
    ],
    [
      "computed assignment-destructured prototype alias",
      'let prototypeAlias: any; ({ ["prototype"]: prototypeAlias } = Alias); prototypeAlias.scan = function replacement(): void {};'
    ],
    [
      "prototype retrieved from a constructed alias",
      "Object.getPrototypeOf(new Alias()).scan = function replacement(): void {};"
    ],
    [
      "aliased prototype retrieved from a constructed alias",
      "const prototypeAlias = Object.getPrototypeOf(new Alias()); prototypeAlias.scan = function replacement(): void {};"
    ],
    [
      "prototype descriptor value",
      'Object.getOwnPropertyDescriptor(Alias, "prototype")!.value.scan = function replacement(): void {};'
    ],
    [
      "prototype retrieved from an instance alias",
      "const instance = new Alias(); Object.getPrototypeOf(instance).scan = function replacement(): void {};"
    ],
    [
      "constructed alias __proto__ chain",
      "(new Alias() as any).__proto__.scan = function replacement(): void {};"
    ],
    [
      "constructed alias constructor prototype chain",
      "(new Alias() as any).constructor.prototype.scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from an object-carried instance",
      "const holder = { instance: new Alias() }; Object.getPrototypeOf(holder.instance).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from an array-carried instance",
      "const instances = [new Alias()]; Object.getPrototypeOf(instances[0]!).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from a helper-returned instance",
      "function make(): Catalog { return new Alias(); } Object.getPrototypeOf(make()).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from an arrow-factory instance",
      "const make = (): Catalog => new Alias(); Object.getPrototypeOf(make()).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from a function-expression factory instance",
      "const make = function (): Catalog { return new Alias(); }; Object.getPrototypeOf(make()).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from an object-method factory instance",
      "const factory = { make(): Catalog { return new Alias(); } }; Object.getPrototypeOf(factory.make()).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from a static-method factory instance",
      "class Factory { static make(): Catalog { return new Alias(); } } Object.getPrototypeOf(Factory.make()).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from an object getter instance",
      "const factory = { get instance(): Catalog { return new Alias(); } }; Object.getPrototypeOf(factory.instance).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from a static getter instance",
      "class Factory { static get instance(): Catalog { return new Alias(); } } Object.getPrototypeOf(Factory.instance).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from an immediately invoked factory instance",
      "Object.getPrototypeOf(((): Catalog => new Alias())()).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from a conditional factory instance",
      "function make(): Catalog { return true ? new Alias() : new Alias(); } Object.getPrototypeOf(make()).scan = function replacement(): void {};"
    ],
    [
      "prototype retrieved from a late-assigned property instance",
      "const holder: { instance?: Catalog } = {}; holder.instance = new Alias(); Object.getPrototypeOf(holder.instance!).scan = function replacement(): void {};"
    ],
    [
      "aliased dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const proto = Object.getPrototypeOf(factory.instance); proto.scan = function replacement(): void {};"
    ],
    [
      "assignment-aliased dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; let proto: any; proto = Object.getPrototypeOf(factory.instance); proto.scan = function replacement(): void {};"
    ],
    [
      "object-carried dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const holder = { proto: Object.getPrototypeOf(factory.instance) }; holder.proto.scan = function replacement(): void {};"
    ],
    [
      "array-carried dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const protos = [Object.getPrototypeOf(factory.instance)]; protos[0]!.scan = function replacement(): void {};"
    ],
    [
      "late property-carried dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const holder: any = {}; holder.proto = Object.getPrototypeOf(factory.instance); holder.proto.scan = function replacement(): void {};"
    ],
    [
      "array-destructured dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const [proto] = [Object.getPrototypeOf(factory.instance)]; proto.scan = function replacement(): void {};"
    ],
    [
      "object-destructured dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const { proto } = { proto: Object.getPrototypeOf(factory.instance) }; proto.scan = function replacement(): void {};"
    ],
    [
      "nested-destructured dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const { nested: { proto } } = { nested: { proto: Object.getPrototypeOf(factory.instance) } }; proto.scan = function replacement(): void {};"
    ],
    [
      "array assignment-destructured dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; let proto: any; [proto] = [Object.getPrototypeOf(factory.instance)]; proto.scan = function replacement(): void {};"
    ],
    [
      "object assignment-destructured dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; let proto: any; ({ proto } = { proto: Object.getPrototypeOf(factory.instance) }); proto.scan = function replacement(): void {};"
    ],
    [
      "member assignment-destructured dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const holder: any = {}; ({ proto: holder.proto } = { proto: Object.getPrototypeOf(factory.instance) }); holder.proto.scan = function replacement(): void {};"
    ],
    [
      "conditional-expression dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const proto = true ? Object.getPrototypeOf(factory.instance) : null; proto!.scan = function replacement(): void {};"
    ],
    [
      "nullish-expression dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const proto = null ?? Object.getPrototypeOf(factory.instance); proto.scan = function replacement(): void {};"
    ],
    [
      "comma-expression dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; const proto = (0, Object.getPrototypeOf(factory.instance)); proto.scan = function replacement(): void {};"
    ],
    [
      "logical-assignment dynamic prototype",
      "const factory = { get instance(): Catalog { return new Alias(); } }; let proto: any; proto ??= Object.getPrototypeOf(factory.instance); proto.scan = function replacement(): void {};"
    ]
  ])("fails closed for a %s", (_label, mutation) => {
    const graph = snapshot({
      "src/catalog.ts": [
        "export class Catalog { scan(): void {} }",
        "const Alias = Catalog;",
        mutation,
        "export function run(): void { new Catalog().scan(); }"
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

  it("keeps static and instance receiver-member identities separate", () => {
    const graph = snapshot({
      "src/catalog.ts": [
        "export class Catalog {",
        "  static scan(): void {}",
        "  scan(): void {}",
        "  static runStatic(): void { this.scan(); }",
        "  runInstance(): void { this.scan(); }",
        "}",
        "export class ChildCatalog extends Catalog {}"
      ].join("\n"),
      "src/consumer.ts": [
        'import { Catalog, ChildCatalog } from "./catalog.js";',
        "export function valid(): void {",
        "  Catalog.scan(); new Catalog().scan();",
        "  ChildCatalog.scan(); new ChildCatalog().scan();",
        "}"
      ].join("\n"),
      "src/static-only.ts": "export class StaticOnly { static scan(): void {} }",
      "src/invalid-instance.ts": [
        'import { StaticOnly } from "./static-only.js";',
        "export function invalidInstance(): void { new StaticOnly().scan(); }"
      ].join("\n"),
      "src/instance-only.ts": "export class InstanceOnly { scan(): void {} }",
      "src/invalid-static.ts": [
        'import { InstanceOnly } from "./instance-only.js";',
        "export function invalidStatic(): void { InstanceOnly.scan(); }"
      ].join("\n")
    });
    const scanSymbols = graph.symbols.filter(
      (symbol) => symbol.qualifiedName === "src/catalog.ts#Catalog.scan"
    );
    const exactCalls = graph.edges.filter(
      (edge) =>
        edge.kind === "calls" &&
        edge.referenceName === "scan" &&
        edge.resolution === "exact" &&
        edge.evidence?.ruleId === "syntax.typescript.proven-receiver-member-call"
    );
    const callerName = (sourceId: string): string | undefined =>
      graph.symbols.find((symbol) => symbol.id === sourceId)?.qualifiedName;

    expect(scanSymbols).toHaveLength(2);
    expect(exactCalls.filter((edge) => callerName(edge.sourceId) === "src/catalog.ts#Catalog.runStatic")).toHaveLength(1);
    expect(exactCalls.filter((edge) => callerName(edge.sourceId) === "src/catalog.ts#Catalog.runInstance")).toHaveLength(1);
    expect(exactCalls.filter((edge) => callerName(edge.sourceId) === "src/consumer.ts#valid")).toHaveLength(4);
    expect(exactCalls.some((edge) => callerName(edge.sourceId) === "src/invalid-instance.ts#invalidInstance")).toBe(false);
    expect(exactCalls.some((edge) => callerName(edge.sourceId) === "src/invalid-static.ts#invalidStatic")).toBe(false);
  });

  it("resolves only directly callable method and function-property members", () => {
    const graph = snapshot({
      "src/callable-properties.ts": [
        "class Properties {",
        "  callback: () => void = (): void => undefined;",
        "  value = 1;",
        "  get returned(): () => void { return (): void => undefined; }",
        "  static staticCallback: () => void = (): void => undefined;",
        "}",
        "export function run(): void {",
        "  const properties = new Properties();",
        "  properties.callback();",
        "  properties.value();",
        "  properties.returned();",
        "  Properties.staticCallback();",
        "}"
      ].join("\n")
    });
    const run = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/callable-properties.ts#run"
    );
    const exactTargets = graph.edges
      .filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.sourceId === run?.id &&
          edge.resolution === "exact" &&
          edge.evidence?.ruleId === "syntax.typescript.proven-receiver-member-call"
      )
      .map((edge) => graph.symbols.find((symbol) => symbol.id === edge.targetId)?.qualifiedName);

    expect(exactTargets).toEqual(
      expect.arrayContaining([
        "src/callable-properties.ts#Properties.callback",
        "src/callable-properties.ts#Properties.staticCallback"
      ])
    );
    expect(exactTargets).toHaveLength(2);
  });

  it("does not resolve cross-file members mutated by their declaring class", () => {
    const graph = snapshot({
      "src/constructor-mutated.ts": [
        "export class ConstructorMutated {",
        "  constructor() { this.scan = (): void => undefined; }",
        "  scan(): void {}",
        "}"
      ].join("\n"),
      "src/prototype-mutated.ts": [
        "export class PrototypeMutated { scan(): void {} }",
        "PrototypeMutated.prototype.scan = (): void => undefined;"
      ].join("\n"),
      "src/static-mutated.ts": [
        "export class StaticMutated { static scan(): void {} }",
        "StaticMutated.scan = (): void => undefined;"
      ].join("\n"),
      "src/consumer-mutations.ts": [
        'import { ConstructorMutated } from "./constructor-mutated.js";',
        'import { PrototypeMutated } from "./prototype-mutated.js";',
        'import { StaticMutated } from "./static-mutated.js";',
        "export function run(): void {",
        "  new ConstructorMutated().scan();",
        "  new PrototypeMutated().scan();",
        "  StaticMutated.scan();",
        "}"
      ].join("\n")
    });
    const run = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/consumer-mutations.ts#run"
    );

    expect(
      graph.edges.filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.sourceId === run?.id &&
          edge.resolution === "exact" &&
          edge.evidence?.ruleId === "syntax.typescript.proven-receiver-member-call"
      )
    ).toEqual([]);
  });

  it("does not resolve inherited members replaced by the receiving subclass", () => {
    const graph = snapshot({
      "src/base-mutated.ts": [
        "export class BaseMutated {",
        "  scan(): void {}",
        "  static staticScan(): void {}",
        "}"
      ].join("\n"),
      "src/child-mutated.ts": [
        'import { BaseMutated } from "./base-mutated.js";',
        "export class ChildMutated extends BaseMutated {",
        '  constructor() { super(); Object.defineProperty(this, "scan", { value: (): void => undefined }); }',
        "}",
        "const ChildAlias = ChildMutated;",
        "ChildAlias.staticScan = (): void => undefined;"
      ].join("\n"),
      "src/prototype-child-mutated.ts": [
        'import { BaseMutated } from "./base-mutated.js";',
        "export class PrototypeChildMutated extends BaseMutated {}",
        "const inheritedPrototype = PrototypeChildMutated.prototype;",
        "inheritedPrototype.scan = (): void => undefined;"
      ].join("\n"),
      "src/consumer-inherited-mutations.ts": [
        'import { ChildMutated } from "./child-mutated.js";',
        'import { PrototypeChildMutated } from "./prototype-child-mutated.js";',
        "export function run(): void {",
        "  new ChildMutated().scan();",
        "  new PrototypeChildMutated().scan();",
        "  ChildMutated.staticScan();",
        "}"
      ].join("\n")
    });
    const run = graph.symbols.find(
      (symbol) => symbol.qualifiedName === "src/consumer-inherited-mutations.ts#run"
    );

    expect(
      graph.edges.filter(
        (edge) =>
          edge.kind === "calls" &&
          edge.sourceId === run?.id &&
          edge.resolution === "exact" &&
          edge.evidence?.ruleId === "syntax.typescript.proven-receiver-member-call"
      )
    ).toEqual([]);
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

  it("does not emit exact receiver-member calls through decorated methods or classes", () => {
    const graph = snapshot({
      "src/decorated.ts": [
        "function replaceMethod(_target: object, _name: string, descriptor: PropertyDescriptor): PropertyDescriptor { return descriptor; }",
        "function replaceClass<T extends new (...args: any[]) => object>(value: T): T { return value; }",
        "function observeParameter(_target: object, _name: string | undefined, _index: number): void {}",
        "class MethodDecorated { @replaceMethod scan(): void {} verify(): void {} }",
        "@replaceClass class ClassDecorated { scan(): void {} }",
        "class ParameterDecorated { verify(): void {} configure(@observeParameter _value: string): void {} }",
        "class ConstructorParameterDecorated { constructor(@observeParameter _value: string) {} verify(): void {} }",
        "class Plain { scan(): void {} }",
        "class DecoratedBase { @replaceMethod scan(): void {} }",
        "class InheritedDecoratedMethod extends DecoratedBase {}",
        "@replaceClass class DecoratedChild extends Plain {}",
        "export function runMethod(): void { new MethodDecorated().scan(); }",
        "export function runOtherMethod(): void { new MethodDecorated().verify(); }",
        "export function runClass(): void { new ClassDecorated().scan(); }",
        "export function runParameterDecorated(): void { new ParameterDecorated().verify(); }",
        "export function runConstructorParameterDecorated(): void { new ConstructorParameterDecorated(\"x\").verify(); }",
        "export function runInheritedMethod(): void { new InheritedDecoratedMethod().scan(); }",
        "export function runDecoratedChild(): void { new DecoratedChild().scan(); }",
        "export function runPlain(): void { new Plain().scan(); }"
      ].join("\n"),
      "src/catalog.ts": [
        "function replaceMethod(_target: object, _name: string, descriptor: PropertyDescriptor): PropertyDescriptor { return descriptor; }",
        "export class Catalog { @replaceMethod scan(): void {} }"
      ].join("\n"),
      "src/consumer.ts": [
        'import { Catalog } from "./catalog.js";',
        "export function runImported(): void { new Catalog().scan(); }"
      ].join("\n")
    });
    const exactMemberCalls = graph.edges.filter(
      (edge) =>
        edge.kind === "calls" &&
        edge.resolution === "exact" &&
        edge.evidence?.ruleId === "syntax.typescript.proven-receiver-member-call"
    );
    const exactCallerNames = exactMemberCalls.map(
      (edge) => graph.symbols.find((symbol) => symbol.id === edge.sourceId)?.qualifiedName
    );

    expect(exactCallerNames).toContain("src/decorated.ts#runPlain");
    expect(exactCallerNames).not.toContain("src/decorated.ts#runMethod");
    expect(exactCallerNames).not.toContain("src/decorated.ts#runOtherMethod");
    expect(exactCallerNames).not.toContain("src/decorated.ts#runClass");
    expect(exactCallerNames).not.toContain("src/decorated.ts#runParameterDecorated");
    expect(exactCallerNames).not.toContain("src/decorated.ts#runConstructorParameterDecorated");
    expect(exactCallerNames).not.toContain("src/decorated.ts#runInheritedMethod");
    expect(exactCallerNames).not.toContain("src/decorated.ts#runDecoratedChild");
    expect(exactCallerNames).not.toContain("src/consumer.ts#runImported");
  });

  it.each<[string, readonly string[]]>([
    ["object", ["const holder = { catalog };", "holder.catalog.scan = (): void => undefined;"]],
    ["array", ["const holders = [catalog];", "holders[0]!.scan = (): void => undefined;"]],
    [
      "factory",
      [
        "function current(): Catalog { return catalog; }",
        "current().scan = (): void => undefined;"
      ]
    ],
    ["container escape", ["mutate({ catalog });"]],
    [
      "getter",
      [
        "const holder = { get current(): Catalog { return catalog; } };",
        "holder.current.scan = (): void => undefined;"
      ]
    ],
    ["IIFE", ["(() => catalog)().scan = (): void => undefined;"]]
  ])("does not emit an exact call after a proven instance escapes through a %s carrier", (_label, mutation) => {
    const graph = snapshot({
      "src/instance-carrier.ts": [
        "class Catalog { scan(): void {} }",
        "declare function mutate(value: unknown): void;",
        "export function run(): void {",
        "  const catalog = new Catalog();",
        ...mutation.map((statement) => `  ${statement}`),
        "  catalog.scan();",
        "}"
      ].join("\n"),
      "src/safe-instance.ts": [
        "class SafeCatalog { scan(): void {} }",
        "export function safe(): void { const safeCatalog = new SafeCatalog(); safeCatalog.scan(); }"
      ].join("\n")
    });
    const exactScanCalls = graph.edges.filter(
      (edge) => edge.kind === "calls" && edge.referenceName === "scan" && edge.resolution === "exact"
    );
    const exactCallerNames = exactScanCalls.map(
      (edge) => graph.symbols.find((symbol) => symbol.id === edge.sourceId)?.qualifiedName
    );

    expect(exactCallerNames).toContain("src/safe-instance.ts#safe");
    expect(exactCallerNames).not.toContain("src/instance-carrier.ts#run");
  });

  it("does not emit exact calls after this-bound receivers escape through aliases", () => {
    const graph = snapshot({
      "src/this-alias.ts": [
        "class Catalog {",
        "  scan(): void {}",
        "  run(): void { const self = this; self.scan = (): void => undefined; this.scan(); }",
        "}",
        "class Dependency { execute(): void {} }",
        "class Consumer {",
        "  constructor(private readonly dependency: Dependency) {}",
        "  run(): void {",
        "    const holder = { dependency: this.dependency };",
        "    holder.dependency.execute = (): void => undefined;",
        "    this.dependency.execute();",
        "  }",
        "}"
      ].join("\n"),
      "src/safe-this.ts": [
        "class SafeCatalog { scan(): void {} run(): void { this.scan(); } }",
        "class SafeDependency { execute(): void {} }",
        "class SafeConsumer {",
        "  constructor(private readonly dependency: SafeDependency) {}",
        "  run(): void { this.dependency.execute(); }",
        "}"
      ].join("\n")
    });
    const exactCalls = graph.edges.filter(
      (edge) => edge.kind === "calls" && edge.resolution === "exact"
    );
    const callPairs = exactCalls.map((edge) => ({
      source: graph.symbols.find((symbol) => symbol.id === edge.sourceId)?.qualifiedName,
      target: graph.symbols.find((symbol) => symbol.id === edge.targetId)?.qualifiedName
    }));

    expect(callPairs).toEqual(
      expect.arrayContaining([
        { source: "src/safe-this.ts#SafeCatalog.run", target: "src/safe-this.ts#SafeCatalog.scan" },
        { source: "src/safe-this.ts#SafeConsumer.run", target: "src/safe-this.ts#SafeDependency.execute" }
      ])
    );
    expect(callPairs.some((pair) => pair.source === "src/this-alias.ts#Catalog.run")).toBe(false);
    expect(callPairs.some((pair) => pair.source === "src/this-alias.ts#Consumer.run")).toBe(false);
  });
});
