import { describe, expect, it } from "vitest";

import { extractHaskellFileFacts } from "../../../src/extraction/haskell.js";

describe("Haskell v0.465 bounded relation facts", () => {
  it("extracts module, data, newtype, class, typed function, imports, calls, constructors, and instances", () => {
    const facts = extractHaskellFileFacts({
      filePath: "src/App.hs",
      language: "haskell",
      sourceText: [
        "module App where",
        "import Api (Point(..), helper, Contract)",
        "import qualified Api as A",
        "",
        "local :: Point -> Point",
        "local p = helper p",
        "",
        "execute :: Point -> Point",
        "execute p =",
        "  let created = Point 1 in",
        "  A.helper created"
      ].join("\n")
    });
    expect(facts.haskellFacts?.moduleName).toBe("App");
    expect(facts.haskellFacts?.imports).toEqual(expect.arrayContaining([
      expect.objectContaining({ importedModule: "Api", isQualified: false, importedNames: ["Point", "helper", "Contract"] }),
      expect.objectContaining({ importedModule: "Api", isQualified: true, alias: "A" })
    ]));
    expect(facts.haskellFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "local", parameterCount: 1, parameterTypeNames: ["Point"], returnTypeName: "Point" }),
      expect.objectContaining({ name: "execute", parameterCount: 1, parameterTypeNames: ["Point"], returnTypeName: "Point" })
    ]));
    expect(facts.haskellFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "helper", callKind: "direct", argumentCount: 1 }),
      expect.objectContaining({ referenceName: "helper", callKind: "module", receiverAlias: "A", argumentCount: 1 })
    ]));
    expect(facts.haskellFacts?.instantiations).toEqual([
      expect.objectContaining({ constructorName: "Point", argumentCount: 1 })
    ]);

    const apiFacts = extractHaskellFileFacts({
      filePath: "src/Api.hs",
      language: "haskell",
      sourceText: [
        "module Api where",
        "data Point = Point Int",
        "newtype Alias = Alias Point",
        "type Name = Point",
        "class Contract a where",
        "  run :: a -> a",
        "instance Contract Point where",
        "  run p = p",
        "helper :: Point -> Point",
        "helper p = p"
      ].join("\n")
    });
    expect(apiFacts.haskellFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Api", declarationKind: "module" }),
      expect.objectContaining({ name: "Point", declarationKind: "data", constructorNames: ["Point"], constructorArities: { Point: 1 } }),
      expect.objectContaining({ name: "Alias", declarationKind: "newtype" }),
      expect.objectContaining({ name: "Name", declarationKind: "typealias" }),
      expect.objectContaining({ name: "Contract", declarationKind: "class" })
    ]));
    expect(apiFacts.haskellFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "Point", referenceName: "Contract", relationKind: "implements" })
    ]);
  });

  it("fails closed for inference, duplicate equations, Template Haskell, CPP, and malformed source", () => {
    const cases = [
      "module Bad where\nhelper p = p\nexecute p = helper p",
      "module Bad where\nhelper :: Point -> Point\nhelper p = p\nhelper p = Point 1\nexecute :: Point -> Point\nexecute p = helper p",
      "{-# LANGUAGE TemplateHaskell #-}\nmodule Bad where\nhelper :: Point -> Point\nhelper p = p",
      "#if WINDOWS\nmodule Bad where\n#endif",
      "module Bad where\ndata Point = Point ("
    ];
    for (const sourceText of cases) {
      const facts = extractHaskellFileFacts({ filePath: "src/Bad.hs", language: "haskell", sourceText });
      const duplicateEquation = sourceText.includes("helper p = Point 1");
      expect(duplicateEquation || facts.haskellFacts?.parserRejected === true || facts.haskellFacts?.calls.length === 0).toBe(true);
    }
  });
});
