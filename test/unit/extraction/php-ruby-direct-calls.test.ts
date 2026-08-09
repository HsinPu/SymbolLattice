import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

function phpFacts(sourceText: string) {
  return extractFileFacts({ filePath: "src/direct.php", language: "php", sourceText });
}

function phpFunctionId(sourceText: string, name: string): string {
  const symbol = phpFacts(sourceText).symbols.find(
    (candidate) => candidate.kind === "function" && candidate.name === name
  );
  if (symbol === undefined) {
    throw new Error(`Expected PHP function ${name} to be extracted.`);
  }
  return symbol.id;
}

function phpCalls(sourceText: string) {
  return phpFacts(sourceText).edges.filter((edge) => edge.kind === "calls");
}

function rubyFacts(sourceText: string) {
  return extractFileFacts({ filePath: "src/direct.rb", language: "ruby", sourceText });
}

function rubyCalls(sourceText: string) {
  return rubyFacts(sourceText).edges.filter((edge) => edge.kind === "calls");
}

describe("PHP and Ruby bounded same-file direct calls", () => {
  it("emits an exact PHP bare call with its unique top-level target evidence", () => {
    const sourceText = [
      "<?php",
      "function php_helper(): int { return 1; }",
      "function php_entry(): int { return php_helper(); }"
    ].join("\n");
    const helperId = phpFunctionId(sourceText, "php_helper");

    expect(phpCalls(sourceText)).toEqual([
      expect.objectContaining({
        sourceId: phpFunctionId(sourceText, "php_entry"),
        targetId: helperId,
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        referenceName: "php_helper",
        evidence: {
          ruleId: "syntax.php.same-file.unique-top-level-function-call",
          stage: "syntax",
          candidateSymbolIds: [helperId]
        }
      })
    ]);
  });

  it("fails closed for PHP shadows, aliases, nested bodies, member forms, duplicates, and variadic calls", () => {
    const cases = [
      [
        "<?php",
        "function php_helper(): int { return 1; }",
        "function php_entry($php_helper): int { return $php_helper(); }"
      ].join("\n"),
      [
        "<?php",
        "function php_helper(): int { return 1; }",
        "function php_entry(): int { $php_helper = fn(): int => 1; return $php_helper(); }"
      ].join("\n"),
      [
        "<?php",
        "use function Vendor\\php_helper as imported_helper;",
        "function php_helper(): int { return 1; }",
        "function php_entry(): int { return imported_helper(); }"
      ].join("\n"),
      [
        "<?php",
        "if (true) { function php_helper(): int { return 1; } }",
        "function php_entry(): int { return php_helper(); }"
      ].join("\n"),
      [
        "<?php",
        "function php_helper(): int { return 1; }",
        "function php_entry(): int { $closure = function(): int { return php_helper(); }; $arrow = fn(): int => php_helper(); return 1; }"
      ].join("\n"),
      [
        "<?php",
        "function call_user_func(string $name): int { return 1; }",
        "function php_helper(): int { return 1; }",
        "function php_entry(object $service): int { $callback = 'php_helper'; $callback(); call_user_func('php_helper'); self::php_helper(); $service->php_helper(); return Vendor\\php_helper(); }"
      ].join("\n"),
      [
        "<?php",
        "function php_helper(): int { return 1; }",
        "function php_helper(string $value): int { return 2; }",
        "function php_entry(): int { return php_helper(...[]); }"
      ].join("\n")
    ];

    for (const sourceText of cases) {
      expect(phpCalls(sourceText)).toEqual([]);
    }
  });

  it("extracts Ruby singleton symbols without making an exact direct-call claim", () => {
    const sourceText = [
      "module Smoke",
      "  def self.ruby_helper",
      "end",
      "",
      "  def self.ruby_entry",
      "    self.ruby_helper()",
      "  end",
      "end"
    ].join("\n");
    expect(rubyFacts(sourceText).symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "module",
          qualifiedName: "src/direct.rb#Smoke"
        }),
        expect.objectContaining({
          kind: "method",
          name: "ruby_helper",
          qualifiedName: "src/direct.rb#Smoke.ruby_helper"
        }),
        expect.objectContaining({
          kind: "method",
          name: "ruby_entry",
          qualifiedName: "src/direct.rb#Smoke.ruby_entry"
        })
      ])
    );
    expect(rubyCalls(sourceText)).toEqual([]);
  });

  it("fails closed for Ruby implicit or dynamic dispatch, scope changes, and module ambiguity", () => {
    const module = (body: readonly string[]) =>
      ["module Smoke", "  def self.ruby_helper", "  end", ...body, "end"].join("\n");
    const cases = [
      module(["", "  def self.ruby_entry", "    ruby_helper", "  end"]),
      module(["", "  def self.ruby_entry", "    Smoke.ruby_helper()", "  end"]),
      module(["", "  def self.ruby_entry(other)", "    other.ruby_helper()", "  end"]),
      module(["", "  def self.ruby_entry", "    ruby_helper = Object.new", "    self.ruby_helper()", "  end"]),
      module(["", "  def self.ruby_entry", "    values.each { self.ruby_helper() }", "  end"]),
      module([
        "",
        "  def self.ruby_entry",
        "    for ruby_helper in values",
        "      self.ruby_helper()",
        "    end",
        "  end"
      ]),
      module(["", "  def self.ruby_entry", "    send(:ruby_helper)", "  end"]),
      module([
        "",
        "  module_function :ruby_helper",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      module([
        "",
        "  define_singleton_method(:ruby_helper) { 2 }",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      module([
        "",
        "  __send__(:define_singleton_method, :ruby_helper) { 2 }",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      module([
        "",
        "  method(:define_singleton_method).call(:ruby_helper) { 2 }",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      module([
        "",
        "  singleton_class.alias_method :ruby_helper, :other_helper",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      module([
        "",
        "  singleton_class.remove_method :ruby_helper",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      module([
        "",
        "  using Refined",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      [
        module(["", "  def self.ruby_entry", "    self.ruby_helper()", "  end"]),
        "Smoke.singleton_class.alias_method :ruby_helper, :other_helper"
      ].join("\n"),
      [
        module(["", "  def self.ruby_entry", "    self.ruby_helper()", "  end"]),
        "Smoke.singleton_class.remove_method :ruby_helper"
      ].join("\n"),
      [
        module(["", "  def self.ruby_entry", "    self.ruby_helper()", "  end"]),
        "Smoke.define_singleton_method(:ruby_helper) { 2 }"
      ].join("\n"),
      [
        module(["", "  def self.ruby_entry", "    self.ruby_helper()", "  end"]),
        "using Refined"
      ].join("\n"),
      [
        module(["", "  def self.ruby_entry", "    self.ruby_helper()", "  end"]),
        "module Other",
        "  Smoke.singleton_class.alias_method :ruby_helper, :other_helper",
        "end"
      ].join("\n"),
      [
        module(["", "  def self.ruby_entry", "    self.ruby_helper()", "  end"]),
        "class Other",
        "  Smoke.singleton_class.remove_method :ruby_helper",
        "end"
      ].join("\n"),
      module(["", "  alias ruby_helper_alias ruby_helper", "", "  def self.ruby_entry", "    self.ruby_helper()", "  end"]),
      module([
        "",
        "  def self.ruby_helper",
        "  end",
        "",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end"
      ]),
      [
        "module Smoke",
        "  def self.ruby_helper",
        "  end",
        "end",
        "module Smoke",
        "  def self.ruby_entry",
        "    self.ruby_helper()",
        "  end",
        "end"
      ].join("\n")
    ];

    for (const sourceText of cases) {
      expect(rubyCalls(sourceText)).toEqual([]);
    }
  });
});
