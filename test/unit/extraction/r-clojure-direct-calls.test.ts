import { describe, expect, it } from "vitest";

import { extractClojureFileFacts } from "../../../src/extraction/clojure.js";
import { extractRFileFacts } from "../../../src/extraction/r.js";
import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";

function symbolByName(facts: ArtifactFacts, name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === "function" && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing function ${name}.`);
  }
  return symbol;
}

function calls(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "calls");
}

describe("R and Clojure bounded same-file direct calls", () => {
  it("preserves R declarations without emitting direct calls", () => {
    const facts = extractRFileFacts({
      filePath: "R/smoke.R",
      language: "r",
      sourceText: `rEntry <- function() {
  rHelper()
}

rHelper <- function() {
  1
}`
    });
    symbolByName(facts, "rEntry");
    symbolByName(facts, "rHelper");
    expect(calls(facts)).toEqual([]);
  });

  it("fails closed for R rebinding, indirect, namespace, loading, duplicate, closure, and dynamic-dispatch forms", () => {
    const sources = [
      ["lexical parameter", `rEntry <- function(rHelper) { rHelper() }\nrHelper <- function() { 1 }`],
      ["local rebinding", `rEntry <- function() { rHelper <- function() { 2 }; rHelper() }\nrHelper <- function() { 1 }`],
      ["global rebinding", `rEntry <- function() { rHelper <<- function() { 2 }; rHelper() }\nrHelper <- function() { 1 }`],
      ["get", `rEntry <- function() { get("rHelper")() }\nrHelper <- function() { 1 }`],
      ["do.call", `rEntry <- function() { do.call("rHelper", list()) }\nrHelper <- function() { 1 }`],
      ["match.fun", `rEntry <- function() { match.fun("rHelper")() }\nrHelper <- function() { 1 }`],
      ["namespace", `rEntry <- function() { foreign::rHelper() }\nrHelper <- function() { 1 }`],
      ["member", `rEntry <- function() { holder$rHelper() }\nrHelper <- function() { 1 }`],
      ["source", `source("foreign.R")\nrEntry <- function() { rHelper() }\nrHelper <- function() { 1 }`],
      ["library", `library(foreign)\nrEntry <- function() { rHelper() }\nrHelper <- function() { 1 }`],
      ["duplicate", `rEntry <- function() { rHelper() }\nrHelper <- function() { 1 }\nrHelper <- function() { 2 }`],
      ["nested closure", `rEntry <- function() { callback <- function() { rHelper() }; callback() }\nrHelper <- function() { 1 }`],
      ["S3 generic", `rEntry <- function() { rHelper() }\nrHelper <- function() { UseMethod("rHelper") }\nrHelper.default <- function() { 1 }`],
      ["S4 generic", `setGeneric("rHelper")\nrEntry <- function() { rHelper() }\nrHelper <- function() { 1 }`],
      ["assign global environment", `rEntry <- function() { assign("rHelper", function() { 2 }, envir = .GlobalEnv); rHelper() }\nrHelper <- function() { 1 }`],
      ["quoted call", `rEntry <- function() { quote(rHelper()) }\nrHelper <- function() { 1 }`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractRFileFacts({ filePath: "R/smoke.R", language: "r", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("preserves Clojure declarations without emitting direct calls", () => {
    const facts = extractClojureFileFacts({
      filePath: "src/smoke.clj",
      language: "clojure",
      sourceText: `(ns smoke)

(defn cEntry []
  (cHelper))

(defn cHelper []
  1)`
    });
    symbolByName(facts, "cEntry");
    symbolByName(facts, "cHelper");
    expect(calls(facts)).toEqual([]);
  });

  it("fails closed for Clojure namespace visibility, rebinding, locals, higher-order, qualified, macro, dynamic, and duplicate forms", () => {
    const sources = [
      ["refer", `(ns smoke (:require [foreign :refer [cHelper]]))\n(defn cEntry [] (cHelper))\n(defn cHelper [] 1)`],
      ["require", `(ns smoke (:require [foreign :as foreign]))\n(defn cEntry [] (cHelper))\n(defn cHelper [] 1)`],
      ["refer-clojure", `(ns smoke (:refer-clojure :exclude [cHelper]))\n(defn cEntry [] (cHelper))\n(defn cHelper [] 1)`],
      ["Var root replacement", `(ns smoke)\n(def cHelper (fn [] 2))\n(defn cEntry [] (cHelper))\n(defn cHelper [] 1)`],
      ["with-redefs", `(ns smoke)\n(defn cEntry [] (with-redefs [cHelper (fn [] 2)] (cHelper)))\n(defn cHelper [] 1)`],
      ["let local", `(ns smoke)\n(defn cEntry [] (let [cHelper (fn [] 2)] (cHelper)))\n(defn cHelper [] 1)`],
      ["fn parameter", `(ns smoke)\n(defn cEntry [] ((fn [cHelper] (cHelper)) (fn [] 2)))\n(defn cHelper [] 1)`],
      ["higher-order", `(ns smoke)\n(defn cEntry [] (apply cHelper []))\n(defn cHelper [] 1)`],
      ["qualified symbol", `(ns smoke)\n(defn cEntry [] (foreign/cHelper))\n(defn cHelper [] 1)`],
      ["macro", `(ns smoke)\n(defmacro cHelper [] 2)\n(defn cEntry [] (cHelper))\n(defn cHelper [] 1)`],
      ["dynamic var", `(ns smoke)\n(def ^:dynamic cHelper (fn [] 2))\n(defn cEntry [] (cHelper))\n(defn cHelper [] 1)`],
      ["quoted call", `(ns smoke)\n(defn cEntry [] '(cHelper))\n(defn cHelper [] 1)`],
      ["duplicate", `(ns smoke)\n(defn cEntry [] (cHelper))\n(defn cHelper [] 1)\n(defn cHelper [] 2)`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractClojureFileFacts({ filePath: "src/smoke.clj", language: "clojure", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
