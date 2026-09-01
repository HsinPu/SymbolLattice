import { describe, expect, it } from "vitest";

import { extractObjectiveCFileFacts } from "../../../src/extraction/objc.js";

function extract(sourceText: string, filePath = "src/Smoke.m") {
  return extractObjectiveCFileFacts({ filePath, language: "objc", sourceText });
}

describe("Objective-C relation facts v0.476", () => {
  it("retains literal imports, protocol heritage, signatures, class messages, and alloc/init", () => {
    const facts = extract(
      [
        '#import "Factory.h"',
        "@interface Smoke : Parent <HealthChecking>",
        "- (Parent *)make:(Child *)child;",
        "+ (void)ping;",
        "@end",
        "@implementation Smoke",
        "- (Parent *)make:(Child *)child { [Factory ping]; [[Child alloc] init]; [self ping]; }",
        "+ (void)ping {}",
        "@end"
      ].join("\n")
    );

    expect(facts.objcFacts?.imports).toEqual([
      expect.objectContaining({ importedPath: "Factory.h", sourceId: expect.any(String) })
    ]);
    expect(facts.objcFacts?.heritage).toEqual([
      expect.objectContaining({ sourceTypeName: "Smoke", targetTypeName: "Parent", relationKind: "extends" }),
      expect.objectContaining({ sourceTypeName: "Smoke", targetTypeName: "HealthChecking", relationKind: "implements" })
    ]);
    expect(facts.objcFacts?.callables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "make:", parameterCount: 1, parameterTypeNames: ["Child"], returnTypeName: "Parent" }),
        expect.objectContaining({ name: "ping", polarity: "+", parameterCount: 0 })
      ])
    );
    expect(facts.objcFacts?.calls).toEqual([
      expect.objectContaining({ receiverTypeName: "Factory", referenceName: "ping", argumentCount: 0 })
    ]);
    expect(facts.objcFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Child", argumentCount: 0 })
    ]);
  });

  it("keeps dynamic self messages, categories, ambiguous class names, and external imports out of exact facts", () => {
    const facts = extract(
      [
        '#import <Foundation/Foundation.h>',
        "@interface Smoke",
        "- (void)entry;",
        "@end",
        "@implementation Smoke",
        "- (void)entry { [self helper]; [value run]; [[Unknown alloc] init]; }",
        "@end",
        "@implementation Smoke (Category)",
        "- (void)helper {}",
        "@end"
      ].join("\n")
    );

    expect(facts.objcFacts?.imports).toEqual([]);
    expect(facts.objcFacts?.calls).toEqual([]);
    expect(facts.objcFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Unknown" })
    ]);
    expect(facts.symbols.some((symbol) => symbol.name === "Category")).toBe(false);
  });
});
