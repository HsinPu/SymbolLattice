import { describe, expect, it } from "vitest";

import { extractClojureFileFacts } from "../../../src/extraction/clojure.js";

describe("Clojure v0.469 bounded relation facts", () => {
  it("extracts namespaces, records, protocols, require bindings, calls, constructors, and type hints", () => {
    const facts = extractClojureFileFacts({
      filePath: "src/app.clj",
      language: "clojure",
      sourceText: [
        "(ns app (:require [api :as api] [api :refer [helper]]))",
        "(defprotocol Contract (run [value]))",
        "(defrecord Point [value] Contract (run [this] this))",
        "(defn ^Point execute [^Point value]",
        "  (api/build value)",
        "  (helper value)",
        "  (->Point value))"
      ].join("\n")
    });

    expect(facts.clojureFacts?.parserRejected).toBe(false);
    expect(facts.clojureFacts?.namespaceName).toBe("app");
    expect(facts.clojureFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "app", declarationKind: "namespace" }),
      expect.objectContaining({ name: "Contract", declarationKind: "protocol" }),
      expect.objectContaining({ name: "Point", declarationKind: "record" })
    ]));
    expect(facts.clojureFacts?.imports).toEqual([
      expect.objectContaining({ importedNamespace: "api", alias: "api" }),
      expect.objectContaining({ importedNamespace: "api", referredNames: ["helper"] })
    ]);
    expect(facts.clojureFacts?.callables).toEqual([
      expect.objectContaining({ name: "execute", parameterCount: 1, parameterTypeNames: ["Point"], returnTypeName: "Point" })
    ]);
    expect(facts.clojureFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ callKind: "namespace", receiverNamespaceName: "api", referenceName: "build", argumentCount: 1 }),
      expect.objectContaining({ callKind: "direct", referenceName: "helper", argumentCount: 1 })
    ]));
    expect(facts.clojureFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Point", constructorKind: "arrow", argumentCount: 1 })
    ]);
    expect(facts.clojureFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "Point", referenceName: "Contract", relationKind: "implements" })
    ]);
  });

  it("fails closed for macros, reader syntax, dynamic dispatch, nested locals, and malformed forms", () => {
    const sources = [
      "(ns bad) (defmacro helper [] 1) (defn run [] (helper))",
      "(ns bad) (defn run [] (apply helper []))",
      "(ns bad) (defn run [] (let [helper (fn [] 1)] (helper)))",
      "(ns bad) (defn run [] '(helper))",
      "(ns bad) (defn run [] #(+ 1 2))",
      "(ns bad) (defn run [] (helper)"
    ];
    for (const sourceText of sources) {
      const facts = extractClojureFileFacts({ filePath: "src/bad.clj", language: "clojure", sourceText });
      expect(facts.clojureFacts?.parserRejected).toBe(true);
      expect(facts.clojureFacts?.calls).toEqual([]);
      expect(facts.clojureFacts?.instantiations).toEqual([]);
      expect(facts.clojureFacts?.heritage).toEqual([]);
    }
  });
});
