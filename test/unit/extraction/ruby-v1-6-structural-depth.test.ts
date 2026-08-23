import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

function rubyFacts(sourceText: string) {
  return extractFileFacts({ filePath: "config/routes.rb", language: "ruby", sourceText });
}

describe("Ruby v1.6 structural depth", () => {
  it("extracts nested class/module declarations and lexical methods through control flow", () => {
    const facts = rubyFacts([
      "def factory(enabled)",
      "  class LocalWorker",
      "    if enabled",
      "      def active",
      "      end",
      "    end",
      "    def self.build",
      "    end",
      "  end",
      "end",
      "module Outer",
      "  module Nested",
      "    unless false",
      "      def run",
      "      end",
      "    end",
      "    def self.load",
      "    end",
      "  end",
      "end"
    ].join("\n"));

    expect(
      facts.symbols
        .filter((symbol) => ["class", "module", "function", "method"].includes(symbol.kind))
        .map((symbol) => [symbol.kind, symbol.name, symbol.qualifiedName])
    ).toEqual([
      ["function", "factory", "config/routes.rb#factory"],
      ["class", "LocalWorker", "config/routes.rb#factory.LocalWorker"],
      ["method", "active", "config/routes.rb#factory.LocalWorker.active"],
      ["method", "build", "config/routes.rb#factory.LocalWorker.build"],
      ["module", "Outer", "config/routes.rb#Outer"],
      ["module", "Nested", "config/routes.rb#Outer.Nested"],
      ["method", "run", "config/routes.rb#Outer.Nested.run"],
      ["method", "load", "config/routes.rb#Outer.Nested.load"]
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toHaveLength(8);
  });

  it("keeps qualified owners and operator, setter, and singleton method names", () => {
    const facts = rubyFacts([
      "module T::Private",
      "  def config=(value)",
      "  end",
      "  def ==(other)",
      "  end",
      "  def self.build! = true",
      "  def self.current=(value)",
      "  end",
      "  def self.[](key)",
      "  end",
      "  def O0",
      "  end",
      "  def BasePrimitive.bit_aligned",
      "  end",
      "end"
    ].join("\n"));

    expect(
      facts.symbols
        .filter((symbol) => ["module", "method"].includes(symbol.kind))
        .map((symbol) => [symbol.kind, symbol.name, symbol.qualifiedName])
    ).toEqual([
      ["module", "Private", "config/routes.rb#T::Private"],
      ["method", "config=", "config/routes.rb#T::Private.config="],
      ["method", "==", "config/routes.rb#T::Private.=="],
      ["method", "build!", "config/routes.rb#T::Private.build!"],
      ["method", "current=", "config/routes.rb#T::Private.current="],
      ["method", "[]", "config/routes.rb#T::Private.[]"],
      ["method", "O0", "config/routes.rb#T::Private.O0"],
      ["method", "bit_aligned", "config/routes.rb#T::Private.BasePrimitive.bit_aligned"]
    ]);
  });

  it("keeps singleton declarations in anonymous class blocks as lexical functions", () => {
    const facts = rubyFacts([
      "factory = Class.new do",
      "  def self.build = :ok",
      "  def run",
      "  end",
      "  class << self",
      "    def alternate = :ok",
      "  end",
      "end"
    ].join("\n"));

    expect(
      facts.symbols
        .filter((symbol) => symbol.kind === "function")
        .map((symbol) => [symbol.name, symbol.qualifiedName])
    ).toEqual([
      ["build", "config/routes.rb#build"],
      ["run", "config/routes.rb#run"],
      ["alternate", "config/routes.rb#alternate"]
    ]);
  });

  it("keeps direct class/module identities and full declaration containment in source order", () => {
    const facts = rubyFacts([
      "module Alpha",
      "  VALUE = 1",
      "end",
      "",
      "class Beta",
      "  def run",
      "  end",
      "end",
      "",
      "module Gamma",
      "  def self.run",
      "  end",
      "end",
      "",
      "module Empty",
      "end",
      "",
      "class Bare",
      "end"
    ].join("\n"));

    const declarations = facts.symbols.filter(
      (symbol) => symbol.kind === "class" || symbol.kind === "module"
    ).sort((left, right) => left.range.start.line - right.range.start.line);
    expect(declarations.map((symbol) => [symbol.kind, symbol.name, symbol.declarationOrdinal])).toEqual([
      ["module", "Alpha", 0],
      ["class", "Beta", 0],
      ["module", "Gamma", 0],
      ["module", "Empty", 0],
      ["class", "Bare", 0]
    ]);
    expect(declarations.every((symbol) => symbol.isExported)).toBe(true);
    const declarationIds = new Set(declarations.map((symbol) => symbol.id));
    expect(
      facts.edges
        .filter((edge) => edge.kind === "contains" && declarationIds.has(edge.targetId))
        .map((edge) => [
          edge.targetId,
          edge.range,
          edge.resolution,
          edge.confidence,
          edge.evidence
        ])
    ).toHaveLength(5);
    for (const edge of facts.edges.filter(
      (candidate) => candidate.kind === "contains" && declarationIds.has(candidate.targetId)
    )) {
      const target = declarations.find((symbol) => symbol.id === edge.targetId);
      expect(edge.range).toEqual(target?.range);
      expect(edge.resolution).toBe("exact");
      expect(edge.confidence).toBe(1);
      expect(edge.evidence).toEqual({
        ruleId: "language.ruby.v1_6.direct-declaration.containment",
        stage: "syntax",
        candidateSymbolIds: [target?.id]
      });
    }
  });

  it("extracts five direct literal verbs with full registration ranges and no handler claim", () => {
    const sourceText = [
      "Rails.application.routes.draw do",
      '  get "/get", to: "health#get"',
      '  post "/post", to: "health#post"',
      '  put "/put", to: "health#put"',
      '  patch "/patch", to: "health#patch"',
      '  delete "/delete", to: "health#delete"',
      "end"
    ].join("\n");
    const facts = rubyFacts(sourceText);
    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    expect(routes.map((route) => route.name)).toEqual([
      "GET /get",
      "POST /post",
      "PUT /put",
      "PATCH /patch",
      "DELETE /delete"
    ]);
    expect(routes.map((route) => route.range)).toEqual([
      { start: { line: 2, column: 3 }, end: { line: 2, column: 31 } },
      { start: { line: 3, column: 3 }, end: { line: 3, column: 34 } },
      { start: { line: 4, column: 3 }, end: { line: 4, column: 31 } },
      { start: { line: 5, column: 3 }, end: { line: 5, column: 37 } },
      { start: { line: 6, column: 3 }, end: { line: 6, column: 40 } }
    ]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
    const contains = facts.edges.filter((edge) => edge.kind === "contains");
    expect(contains).toHaveLength(routes.length);
    for (const edge of contains) {
      const target = routes.find((route) => route.id === edge.targetId);
      expect(edge.sourceId).toBe(facts.symbols[0]?.id);
      expect(edge.range).toEqual(target?.range);
      expect(edge.resolution).toBe("exact");
      expect(edge.confidence).toBe(1);
      expect(edge.evidence).toEqual({
        ruleId: "language.ruby.v1_6_1.rails.direct-routes-draw.literal-registration.containment",
        stage: "syntax",
        candidateSymbolIds: [target?.id]
      });
    }
  });

  it("keeps duplicate direct registrations as ordinal 0 and 1 occurrences", () => {
    const facts = rubyFacts([
      "Rails.application.routes.draw do",
      '  get "/duplicate", to: "health#show"',
      '  get "/duplicate", to: "health#show"',
      "end"
    ].join("\n"));
    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    expect(routes.map((route) => route.declarationOrdinal)).toEqual([0, 1]);
    expect(routes[0]?.id).not.toBe(routes[1]?.id);
    expect(routes[0]?.range).not.toEqual(routes[1]?.range);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toHaveLength(2);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
  });

  it("accepts parser comments as trivia around the plain URI and to pair", () => {
    const facts = rubyFacts([
      "Rails.application.routes.draw do",
      '  get "/commented", # keep this registration static',
      '    to: "health#show"',
      "end"
    ].join("\n"));
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toMatchObject([
      { name: "GET /commented", declarationOrdinal: 0 }
    ]);
  });

  it("extracts hash-rocket registrations at lexical depth with optional literal as", () => {
    const facts = rubyFacts([
      "class HealthControllerTest",
      "  def setup",
      "    Rails.application.routes.draw do",
      '      get "/up" => "rails/health#show", as: :rails_health_check',
      '      get "/rails/info/properties" => "rails/info#properties"',
      '      get "/rails/info/notes" => "rails/info#notes"',
      '      post "/rails/:test/properties" => "rails/info#properties"',
      '      put "/rails/:test/named_properties" => "rails/info#properties", as: "named_rails_info_properties"',
      "    end",
      "  end",
      "end"
    ].join("\n"));
    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    expect(routes.map((route) => route.name)).toEqual([
      "GET /up",
      "GET /rails/info/properties",
      "GET /rails/info/notes",
      "POST /rails/:test/properties",
      "PUT /rails/:test/named_properties"
    ]);
    expect(routes.map((route) => route.declarationOrdinal)).toEqual([0, 0, 0, 0, 0]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
    const routeIds = new Set(routes.map((route) => route.id));
    const contains = facts.edges.filter(
      (edge) => edge.kind === "contains" && routeIds.has(edge.targetId)
    );
    expect(contains).toHaveLength(routes.length);
    for (const edge of contains) {
      const target = routes.find((route) => route.id === edge.targetId);
      expect(edge.range).toEqual(target?.range);
      expect(edge.resolution).toBe("exact");
      expect(edge.confidence).toBe(1);
      expect(edge.evidence).toEqual({
        ruleId: "language.ruby.v1_6_1.rails.direct-routes-draw.literal-registration.containment",
        stage: "syntax",
        candidateSymbolIds: [target?.id]
      });
    }
  });

  it("keeps route calls nested below an inner call or block nonclaim", () => {
    const facts = rubyFacts([
      "class RoutesTest",
      "  def setup",
      "    Rails.application.routes.draw do",
      '      namespace :admin do get "/nested" => "admin#show" end',
      '      if enabled then get "/conditional" => "health#show" end',
      "    end",
      "  end",
      "end"
    ].join("\n"));
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
  });

  it.each([
    ["extra identifier", 'get extra, "/extra" => "health#show"'],
    ["splat argument", 'get *args, "/splat" => "health#show"'],
    ["keyword splat", 'get "/keyword-splat" => "health#show", **opts'],
    ["block argument", 'get "/block" => "health#show", &block'],
    ["dynamic path", 'get path => "health#show"'],
    ["dynamic handler", 'get "/dynamic" => handler'],
    ["unsupported verb", 'head "/head" => "health#show"']
  ])("rejects hash-rocket %s route shape", (_label, registration) => {
    const facts = rubyFacts([
      "class RoutesTest",
      "  def setup",
      "    Rails.application.routes.draw do",
      `      ${registration}`,
      "    end",
      "  end",
      "end"
    ].join("\n"));
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
  });

  it("keeps separately valid hash-rocket duplicates as ordinals 0 and 1", () => {
    const facts = rubyFacts([
      "class RoutesTest",
      "  def setup",
      "    Rails.application.routes.draw do",
      '      get "/duplicate" => "health#show"',
      '      get "/duplicate" => "health#show"',
      "    end",
      "  end",
      "end"
    ].join("\n"));
    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    expect(routes.map((route) => route.declarationOrdinal)).toEqual([0, 1]);
    expect(routes[0]?.id).not.toBe(routes[1]?.id);
    const routeIds = new Set(routes.map((route) => route.id));
    expect(
      facts.edges.filter((edge) => edge.kind === "contains" && routeIds.has(edge.targetId))
    ).toHaveLength(2);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
  });

  it("rejects draw blocks with block parameters", () => {
    const facts = rubyFacts([
      "Rails.application.routes.draw do |map|",
      '  get "/parameterized", to: "health#show"',
      "end"
    ].join("\n"));
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toEqual([]);
  });

  it("assigns duplicate nested draw registrations by source offset", () => {
    const facts = rubyFacts([
      "Rails.application.routes.draw do",
      "  Rails.application.routes.draw do",
      '    get "/duplicate", to: "health#show"',
      "  end",
      '  get "/duplicate", to: "health#show"',
      "end"
    ].join("\n"));
    const routes = facts.symbols.filter((symbol) => symbol.kind === "route");
    expect(routes).toHaveLength(2);
    expect(routes.map((route) => route.declarationOrdinal)).toEqual([0, 1]);
    expect(routes.map((route) => route.range.start.line)).toEqual([3, 5]);
    expect(routes[0]?.id).not.toBe(routes[1]?.id);
    const routeIds = new Set(routes.map((route) => route.id));
    expect(
      facts.edges.filter((edge) => edge.kind === "contains" && routeIds.has(edge.targetId))
    ).toHaveLength(2);
  });

  it("accepts camel-case literal route aliases", () => {
    const facts = rubyFacts([
      "Rails.application.routes.draw do",
      '  get "/camel" => "health#show", as: :fooBar',
      "end"
    ].join("\n"));
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toMatchObject([
      { name: "GET /camel", declarationOrdinal: 0 }
    ]);
  });

  it("fails closed without RangeError for adversarial deep syntax", () => {
    const sourceText = [
      "if true",
      ...Array.from({ length: 4000 }, () => "if true"),
      'Rails.application.routes.draw { get "/deep", to: "health#show" }',
      ...Array.from({ length: 4001 }, () => "end")
    ].join("\n");
    expect(() => rubyFacts(sourceText)).not.toThrow(RangeError);
    const facts = rubyFacts(sourceText);
    expect(facts.symbols).toHaveLength(1);
    expect(facts.edges).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
  });

  it.each([
    ["extra identifier", 'get "/extra", to: "health#show", extra'],
    ["splat argument", 'get "/splat", *args, to: "health#show"'],
    ["keyword splat", 'get "/keyword-splat", **opts, to: "health#show"'],
    ["block argument", 'get "/block", &block, to: "health#show"']
  ])("rejects %s route argument shapes", (_label, registration) => {
    const facts = rubyFacts([
      "Rails.application.routes.draw do",
      `  ${registration}`,
      "end"
    ].join("\n"));
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "contains")).toEqual([]);
  });

  it.each([
    ["nested route DSL", 'Rails.application.routes.draw { namespace :admin do; get "/nested", to: "health#show"; end }'],
    ["dynamic path", 'path = "/dynamic"\nRails.application.routes.draw { get path, to: "health#show" }'],
    ["symbol path", 'Rails.application.routes.draw { get :health, to: "health#show" }'],
    ["eval forgery", 'eval("Rails.application.routes.draw { get \'/eval\', to: \'health#show\' }")'],
    ["malformed recovery", 'Rails.application.routes.draw do\n  get "/broken", to: "health#show"']
  ])("fails closed for %s route roots", (_label, sourceText) => {
    const facts = rubyFacts(sourceText);
    expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(facts.pendingReferences).toEqual([]);
  });
});
