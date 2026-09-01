import { describe, expect, it } from "vitest";

import { extractPhpFileFacts } from "../../../src/extraction/php.js";

describe("PHP v0.475 bounded relation facts", () => {
  it("extracts namespace, use imports, class heritage, signatures, new, and static calls", () => {
    const facts = extractPhpFileFacts({
      filePath: "src/App.php",
      language: "php",
      sourceText: [
        "<?php",
        "namespace App;",
        "use Domain\\Model;",
        "use function Domain\\build as buildModel;",
        "class Child extends Model {",
        "  public static function make(Model $value): Model { return new Model(); }",
        "  public function run(Model $value): Model { return Model::make($value); }",
        "}",
        "function execute(Model $value): Model { return buildModel($value); }"
      ].join("\n")
    });

    expect(facts.phpFacts?.parserRejected).toBe(false);
    expect(facts.phpFacts?.namespaceName).toBe("App");
    expect(facts.phpFacts?.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ importedName: "Domain\\Model", localName: "Model", importKind: "class" }),
        expect.objectContaining({ importedName: "Domain\\build", localName: "buildModel", importKind: "function" })
      ])
    );
    expect(facts.phpFacts?.types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Child", declarationKind: "class" })
      ])
    );
    expect(facts.phpFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "Child", targetTypeName: "Model" })
    ]);
    expect(facts.phpFacts?.callables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "run", ownerTypeName: "Child", parameterTypeNames: ["Model"], returnTypeName: "Model" }),
        expect.objectContaining({ name: "execute", parameterTypeNames: ["Model"], returnTypeName: "Model" })
      ])
    );
    expect(facts.phpFacts?.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callKind: "static", receiverTypeName: "Model", referenceName: "make" }),
        expect.objectContaining({ callKind: "direct", referenceName: "buildModel" })
      ])
    );
    expect(facts.phpFacts?.instantiations).toEqual(
      expect.arrayContaining([expect.objectContaining({ typeName: "Model" })])
    );
    expect(facts.edges.filter((edge) => ["imports", "calls", "instantiates", "extends", "accepts", "returns"].includes(edge.kind))).toEqual([]);
  });

  it("marks malformed PHP as parser-rejected", () => {
    const facts = extractPhpFileFacts({ filePath: "src/bad.php", language: "php", sourceText: "<?php class Broken {" });
    expect(facts.phpFacts?.parserRejected).toBe(true);
    expect(facts.phpFacts?.calls).toEqual([]);
  });
});
