import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

// Representative cross-file inputs from the first project-relations fixture for
// each language. These snapshots are intentionally captured before the resolver
// functions are moved so a later extraction/move can be checked mechanically.
const cases: readonly {
  language: SourceDocument["language"];
  files: Readonly<Record<string, string>>;
  consumerPath: string;
}[] = [
  {
    language: "elixir",
    consumerPath: "src/app.ex",
    files: {
      "src/model.ex": [
        "defmodule Model do",
        "  defstruct value: 0",
        "end"
      ].join("\n"),
      "src/api.ex": [
        "defmodule Api do",
        "  alias Model",
        "  @spec build(%Model{}) :: %Model{}",
        "  def build(value) do",
        "    value",
        "  end",
        "end"
      ].join("\n"),
      "src/contract.ex": [
        "defprotocol Contract do",
        "  def run(value)",
        "end",
        "defmodule Service do",
        "  @behaviour Contract",
        "  @spec run(%Model{}) :: %Model{}",
        "  def run(value) do",
        "    value",
        "  end",
        "end",
        "defimpl Contract, for: Model do",
        "  def run(value) do",
        "    value",
        "  end",
        "end"
      ].join("\n"),
      "src/app.ex": [
        "defmodule App do",
        "  alias Api",
        "  alias Model",
        "  @spec execute(%Model{}) :: %Model{}",
        "  def execute(value) do",
        "    created = %Model{value: value}",
        "    Api.build(created)",
        "    execute_local(created)",
        "  end",
        "  @spec execute_local(%Model{}) :: %Model{}",
        "  def execute_local(value) do",
        "    value",
        "  end",
        "end"
      ].join("\n")
    }
  },
  {
    language: "erlang",
    consumerPath: "src/app.erl",
    files: {
      "src/api.erl": [
        "-module(api).",
        "-export([helper/1]).",
        "-export_type([point/0]).",
        "-record(point, {value}).",
        "-type point() :: atom().",
        "-spec helper(point()) -> point().",
        "helper(Value) -> Value."
      ].join("\n"),
      "src/app.erl": [
        "-module(app).",
        "-import(api, [helper/1]).",
        "-export([execute/1, local/0]).",
        "-spec execute(point()) -> point().",
        "execute(Value) ->",
        "  Point = #point{value = Value},",
        "  api:helper(Point),",
        "  helper(Point),",
        "  local().",
        "local() -> ok."
      ].join("\n"),
      "src/contract.erl": [
        "-module(contract).",
        "-export([]).",
        "-callback run(point()) -> point()."
      ].join("\n"),
      "src/service.erl": [
        "-module(service).",
        "-behaviour(contract).",
        "-export([run/1]).",
        "-spec run(point()) -> point().",
        "run(Value) -> Value."
      ].join("\n")
    }
  },
  {
    language: "clojure",
    consumerPath: "src/app.clj",
    files: {
      "src/api.clj": [
        "(ns api)",
        "(defn build [value] value)",
        "(defn helper [value] value)"
      ].join("\n"),
      "src/contract.clj": "(ns contract)\n(defprotocol Contract (run [value]))\n",
      "src/model.clj": [
        "(ns model (:require [contract :refer [Contract]]))",
        "(defrecord Point [value] Contract (run [this] this))"
      ].join("\n"),
      "src/app.clj": [
        "(ns app (:require [api :as api] [api :refer [helper]] [model :refer [Point ->Point]]))",
        "(defn local [value] value)",
        "(defn ^Point execute [^Point value]",
        "  (api/build value)",
        "  (helper value)",
        "  (local value)",
        "  (->Point value))"
      ].join("\n")
    }
  },
  {
    language: "nim",
    consumerPath: "src/app.nim",
    files: {
      "src/api.nim": "proc build*(value: int): int = value\n",
      "src/base.nim": "type Parent* = object\n",
      "src/model.nim": [
        "import base",
        "type Child* = object of Parent"
      ].join("\n"),
      "src/app.nim": [
        "import api, model",
        "proc helper*(value: int): int = value",
        "proc local*(value: int): int = helper(value)",
        "proc remote*(value: int): int = api.build(value)",
        "proc make*(): Child = Child()"
      ].join("\n")
    }
  }
];

function buildSnapshot(
  language: SourceDocument["language"],
  files: Readonly<Record<string, string>>
) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/resolver-beam-nim-parity/${relativePath}`,
    language,
    sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((file) => extractFileFacts({
      filePath: file.relativePath,
      sourceText: file.sourceText,
      language
    })),
    indexedAt: "2026-09-09T00:00:00.000Z"
  });
}

function exactCrossFileEdges(result: ReturnType<typeof buildSnapshot>) {
  const symbols = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
  return result.edges.filter((edge) =>
    edge.resolution === "exact" &&
    symbols.get(edge.targetId)?.filePath !== undefined &&
    symbols.get(edge.targetId)?.filePath !== edge.filePath
  );
}

function exactLocalRelations(result: ReturnType<typeof buildSnapshot>) {
  const symbols = new Map(result.symbols.map((symbol) => [symbol.id, symbol]));
  return result.edges.filter((edge) => {
    if (edge.kind !== "calls" || edge.resolution !== "exact") return false;
    const target = symbols.get(edge.targetId);
    return target?.filePath === edge.filePath;
  });
}

describe("beam and Nim resolver output parity before move", () => {
  it.each(cases)("$language preserves non-empty cross-file relations and evidence", ({ language, files }) => {
    const result = buildSnapshot(language, files);
    expect(exactCrossFileEdges(result).length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });

  it.each(cases)("$language preserves local relations while rejecting consumer-only targets", ({ language, files, consumerPath }) => {
    const consumerSource = files[consumerPath];
    if (consumerSource === undefined) throw new Error(`Missing consumer fixture: ${consumerPath}`);
    const result = buildSnapshot(language, { [consumerPath]: consumerSource });
    expect(exactCrossFileEdges(result)).toEqual([]);
    expect(exactLocalRelations(result).length).toBeGreaterThan(0);
    expect(result).toMatchSnapshot();
  });
});
