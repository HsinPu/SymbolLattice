import { describe, expect, it } from "vitest";

import { extractElixirFileFacts } from "../../../src/extraction/elixir.js";

describe("Elixir v0.467 bounded relation facts", () => {
  it("extracts modules, structs, specs, aliases, imports, calls, and struct creation", () => {
    const facts = extractElixirFileFacts({
      filePath: "lib/app.ex",
      language: "elixir",
      sourceText: [
        "defmodule App do",
        "  alias Api, as: ServiceApi",
        "  alias Model",
        "  import Helpers, only: [helper: 1]",
        "  @type local_model :: Model",
        "  @behaviour Contract",
        "  @spec run(%Model{}) :: %Model{}",
        "  def run(value) do",
        "    ServiceApi.build(value)",
        "    helper(value)",
        "    %Model{value: value}",
        "  end",
        "end"
      ].join("\n")
    });

    expect(facts.elixirFacts?.parserRejected).toBe(false);
    expect(facts.elixirFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "App", declarationKind: "module" }),
      expect.objectContaining({ name: "local_model", declarationKind: "type" })
    ]));
    expect(facts.elixirFacts?.aliases).toEqual(expect.arrayContaining([
      expect.objectContaining({ importedModule: "Api", localName: "ServiceApi" }),
      expect.objectContaining({ importedModule: "Model", localName: "Model" })
    ]));
    expect(facts.elixirFacts?.imports).toEqual([
      expect.objectContaining({ importedModule: "Helpers", importedNames: ["helper"] })
    ]);
    expect(facts.elixirFacts?.callables).toEqual([
      expect.objectContaining({
        name: "run",
        parameterCount: 1,
        parameterTypeNames: ["Model"],
        returnTypeName: "Model"
      })
    ]);
    expect(facts.elixirFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ callKind: "module", receiverModuleName: "ServiceApi", referenceName: "build", argumentCount: 1 }),
      expect.objectContaining({ callKind: "direct", referenceName: "helper", argumentCount: 1 })
    ]));
    expect(facts.elixirFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Model", argumentCount: 1 })
    ]);
    expect(facts.elixirFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "App", referenceName: "Contract", relationKind: "implements" })
    ]);
  });

  it("keeps protocol and defimpl facts explicit while rejecting macro and malformed files", () => {
    const contract = extractElixirFileFacts({
      filePath: "lib/contract.ex",
      language: "elixir",
      sourceText: [
        "defprotocol Renderable do",
        "  def render(value)",
        "end",
        "defimpl Renderable, for: Model do",
        "  def render(value) do",
        "    value",
        "  end",
        "end"
      ].join("\n")
    });
    expect(contract.elixirFacts?.types).toEqual([
      expect.objectContaining({ name: "Renderable", declarationKind: "protocol" })
    ]);
    expect(contract.elixirFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "Model", referenceName: "Renderable" })
    ]);
    expect(contract.elixirFacts?.callables).toEqual([
      expect.objectContaining({ name: "render", moduleName: "Model" })
    ]);

    const behaviour = extractElixirFileFacts({
      filePath: "lib/behaviour.ex",
      language: "elixir",
      sourceText: [
        "defmodule Behaviour do",
        "  @callback render(%Model{}) :: %Model{}",
        "  defexception [:reason]",
        "end"
      ].join("\n")
    });
    expect(behaviour.elixirFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Behaviour", declarationKind: "exception" })
    ]));
    expect(behaviour.elixirFacts?.callables).toEqual([
      expect.objectContaining({ name: "render", callableKind: "callback", parameterTypeNames: ["Model"], returnTypeName: "Model" })
    ]);

    const macro = extractElixirFileFacts({
      filePath: "lib/macro.ex",
      language: "elixir",
      sourceText: "defmodule Macro do\n  defmacro generated do\n    quote do: :ok\n  end\nend"
    });
    expect(macro.elixirFacts?.parserRejected).toBe(true);
    expect(macro.elixirFacts?.calls).toEqual([]);
    expect(macro.elixirFacts?.instantiations).toEqual([]);

    const malformed = extractElixirFileFacts({
      filePath: "lib/malformed.ex",
      language: "elixir",
      sourceText: "defmodule Malformed do\n  def run(value) do\n    %Model{value: value}\n"
    });
    expect(malformed.elixirFacts?.parserRejected).toBe(true);
    expect(malformed.elixirFacts?.types).toEqual([]);
    expect(malformed.elixirFacts?.calls).toEqual([]);
    expect(malformed.elixirFacts?.instantiations).toEqual([]);
  });
});
