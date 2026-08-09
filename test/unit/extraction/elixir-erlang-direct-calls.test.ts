import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

type DirectCallLanguage = "elixir" | "erlang";

function factsFor(language: DirectCallLanguage, sourceText: string): ArtifactFacts {
  return extractFileFacts({
    filePath: language === "elixir" ? "lib/smoke.ex" : "src/smoke.erl",
    language,
    sourceText
  });
}

function methodByName(facts: ArtifactFacts, name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === "method" && symbol.name === name);
  expect(matches).toHaveLength(1);
  const method = matches[0];
  if (method === undefined) {
    throw new Error(`Missing method ${name}.`);
  }
  return method;
}

function callsFor(language: DirectCallLanguage, sourceText: string) {
  return factsFor(language, sourceText).edges.filter((edge) => edge.kind === "calls");
}

describe("Elixir and Erlang bounded same-module direct calls", () => {
  it("emits an exact Elixir bare zero-argument call to one same-module method", () => {
    const sourceText = `defmodule Smoke do
  def entry() do
    helper()
  end

  defp helper() do
    :ok
  end
end`;
    const facts = factsFor("elixir", sourceText);
    const caller = methodByName(facts, "entry");
    const callee = methodByName(facts, "helper");

    expect(facts.edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        filePath: "lib/smoke.ex",
        range: {
          start: { line: 3, column: 5 },
          end: { line: 3, column: 13 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "helper",
        evidence: {
          ruleId: "syntax.elixir.same-module.unique-bare-zero-argument-direct-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("emits an exact Erlang local zero-arity function call", () => {
    const sourceText = `-module(smoke).
-export([entry/0]).
entry() -> helper().
helper() -> ok.`;
    const facts = factsFor("erlang", sourceText);
    const caller = methodByName(facts, "entry/0");
    const callee = methodByName(facts, "helper/0");

    expect(facts.edges.filter((edge) => edge.kind === "calls")).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        filePath: "src/smoke.erl",
        range: {
          start: { line: 3, column: 12 },
          end: { line: 3, column: 20 }
        },
        resolution: "exact",
        confidence: 1,
        referenceName: "helper/0",
        evidence: {
          ruleId: "syntax.erlang.same-module.unique-zero-arity-direct-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for Elixir imports, aliases, macros, rebindings, arity, quoted code, remote calls, and duplicate targets", () => {
    const sources = [
      `defmodule Smoke do
  import Foreign
  def entry() do
    helper()
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  alias Foreign.Helper
  def entry() do
    helper()
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  defmacro helper() do
    :generated
  end
  def entry() do
    helper()
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  def entry() do
    helper = fn -> :dynamic end
    helper.()
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  def entry() do
    helper(:value)
  end
  def helper(value) do
    value
  end
end`,
      `defmodule Smoke do
  def entry() do
    quote do
      helper()
    end
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  def entry() do
    callback =
      fn
        ->
          helper()
      end
    marker = :do
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  def entry() do
    callback =
      fn
        value ->
          helper()
      end
    marker = :do
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  def entry() do
    Foreign.helper()
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  def entry() do
    apply(__MODULE__, :helper, [])
  end
  def helper() do
    :ok
  end
end`,
      `defmodule Smoke do
  def entry() do
    helper()
  end
  def helper() do
    :one
  end
  def helper() do
    :two
  end
end`
    ] as const;

    for (const sourceText of sources) {
      expect(callsFor("elixir", sourceText), sourceText).toEqual([]);
    }
  });

  it("fails closed for Erlang imports, macros, remote or dynamic dispatch, nonzero arity, clauses, and duplicate targets", () => {
    const sources = [
      `-module(smoke).
-import(foreign, [helper/0]).
entry() -> helper().
helper() -> ok.`,
      `-module(smoke).
-'compile'({parse_transform, foreign}).
entry() -> helper().
helper() -> ok.`,
      `-module(smoke).
-define(UNUSED, ok).
entry() -> helper().
helper() -> ok.`,
      `-module(smoke).
entry() -> foreign:helper().
helper() -> ok.`,
      `-module(smoke).
entry() -> apply(?MODULE, helper, []).
helper() -> ok.`,
      `-module(smoke).
entry() -> helper(value).
helper(Value) -> Value.`,
      `-module(smoke).
entry() -> helper(); entry() -> helper().
helper() -> ok.`,
      `-module(smoke).
entry() -> helper().
helper() -> ok.
helper() -> other.`
    ] as const;

    for (const sourceText of sources) {
      expect(callsFor("erlang", sourceText), sourceText).toEqual([]);
    }
  });
});
