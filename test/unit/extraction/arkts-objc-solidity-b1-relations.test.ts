import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractArkTsFileFacts } from "../../../src/extraction/arkts.js";
import { extractObjectiveCFileFacts } from "../../../src/extraction/objc.js";
import { extractSolidityFileFacts } from "../../../src/extraction/solidity.js";

function symbolByName(facts: ArtifactFacts, kind: SymbolNode["kind"], name: string): SymbolNode {
  const matches = facts.symbols.filter((symbol) => symbol.kind === kind && symbol.name === name);
  expect(matches).toHaveLength(1);
  const symbol = matches[0];
  if (symbol === undefined) {
    throw new Error(`Missing ${kind} ${name}.`);
  }
  return symbol;
}

function relations(facts: ArtifactFacts, kind: "calls" | "handles" | "extends") {
  return facts.edges.filter((edge) => edge.kind === kind);
}

describe("ArkTS, Objective-C, and Solidity B1 evidence-first relations", () => {
  it("keeps ArkTS Entry handles local to its complete Component struct", () => {
    const facts = extractArkTsFileFacts({
      filePath: "src/Smoke.ets",
      language: "arkts",
      sourceText: `@Entry
@Component
struct Smoke {
  build() {}
}`
    });
    const entrypoint = symbolByName(facts, "entrypoint", "ui root Smoke");
    const component = symbolByName(facts, "class", "Smoke");

    expect(relations(facts, "handles")).toEqual([
      expect.objectContaining({
        sourceId: entrypoint.id,
        targetId: component.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "Smoke",
        evidence: {
          ruleId: "framework.arkui.entry-component.local-struct",
          stage: "syntax",
          candidateSymbolIds: [component.id]
        }
      })
    ]);
  });

  it("keeps Objective-C self-message dispatch unresolved while linking a unique same-file superclass", () => {
    const facts = extractObjectiveCFileFacts({
      filePath: "src/Smoke.m",
      language: "objc",
      sourceText: `@interface Parent : NSObject
@end

@interface Smoke : Parent
- (void)helper;
- (void)entry;
@end

@implementation Smoke
- (void)helper {}
- (void)entry { [self helper]; }
@end`
    });
    const owner = symbolByName(facts, "class", "Smoke");
    const parent = symbolByName(facts, "class", "Parent");

    expect(relations(facts, "extends")).toEqual([
      expect.objectContaining({
        sourceId: owner.id,
        targetId: parent.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "Parent",
        evidence: {
          ruleId: "syntax.objc.same-file.unique-interface-superclass",
          stage: "syntax",
          candidateSymbolIds: [parent.id]
        }
      })
    ]);
    expect(relations(facts, "calls")).toEqual([]);
  });

  it("extracts the LLVM gnustep2 same-line empty superclass interface conservatively", () => {
    const facts = extractObjectiveCFileFacts({
      filePath: "clang/test/CodeGenObjC/gnustep2-class.m",
      language: "objc",
      sourceText: `@interface Super @end
@interface X : Super
+ (void)clsMeth;
@end
@implementation X
+ (void)clsMeth {}
@end`
    });
    const superClass = symbolByName(facts, "class", "Super");
    const owner = symbolByName(facts, "class", "X");
    const classMethod = symbolByName(facts, "method", "clsMeth");

    expect(classMethod.qualifiedName).toBe("clang/test/CodeGenObjC/gnustep2-class.m#X.clsMeth");
    expect(relations(facts, "extends")).toEqual([
      expect.objectContaining({
        sourceId: owner.id,
        targetId: superClass.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "Super"
      })
    ]);
  });

  it("rejects unsafe same-line Objective-C container lookalikes", () => {
    const unsafeSources = [
      `@interface Fake () @end`,
      `@interface Fake (Category) @end`,
      `@interface Fake : Base @end`,
      `@interface Fake - (void)run; @end`,
      `@interface Fake @end trailing`,
      `@interface Fake @end\n@interface Fake @end`,
      `@interface Fake "content" @end`,
      `@interface Fake 'c' @end`,
      `@interface Fake @end "trailing"`,
      `@interface Fake @end 't'`
    ] as const;

    for (const sourceText of unsafeSources) {
      const facts = extractObjectiveCFileFacts({ filePath: "src/Fake.m", language: "objc", sourceText });
      expect(facts.symbols.map((symbol) => symbol.kind), sourceText).toEqual(["file"]);
      expect(facts.edges, sourceText).toEqual([]);
    }
  });

  it("allows comments as trivia in a same-line empty Objective-C interface", () => {
    const facts = extractObjectiveCFileFacts({
      filePath: "src/Commented.m",
      language: "objc",
      sourceText: `@interface Commented /* legal trivia */ @end // trailing comment`
    });

    expect(facts.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.name)).toEqual([
      "Commented"
    ]);
  });

  it("keeps Objective-C class and instance methods with the same selector distinct", () => {
    const facts = extractObjectiveCFileFacts({
      filePath: "src/Dual.m",
      language: "objc",
      sourceText: `@interface Dual : NSObject
+ (id)shared;
- (id)shared;
@end

@implementation Dual
+ (id)shared { return nil; }
- (id)shared { return nil; }
@end`
    });
    const methods = facts.symbols.filter(
      (symbol) => symbol.kind === "method" && symbol.name === "shared"
    );

    expect(methods).toHaveLength(2);
    expect(new Set(methods.map((method) => method.id)).size).toBe(2);
    expect(new Set(methods.map((method) => method.qualifiedName)).size).toBe(2);
  });

  it("fails closed for duplicate same-polarity Objective-C implementations", () => {
    const facts = extractObjectiveCFileFacts({
      filePath: "src/Duplicate.m",
      language: "objc",
      sourceText: `@implementation Duplicate
- (void)run {}
- (void)run {}
@end`
    });

    expect(facts.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(facts.edges).toEqual([]);
  });

  it("does not treat conditional Objective-C or React Native text as exact facts", () => {
    const conditionalClass = extractObjectiveCFileFacts({
      filePath: "src/Conditional.m",
      language: "objc",
      sourceText: `#ifdef ENABLE_CONDITIONAL
@interface Conditional : NSObject
@end
#endif`
    });
    const conditionalMacro = extractObjectiveCFileFacts({
      filePath: "ios/ConditionalModule.m",
      language: "objc",
      sourceText: `#import <React/RCTBridgeModule.h>
@implementation ConditionalModule
#if ENABLE_EXPORT
RCT_EXPORT_MODULE(ConditionalModule)
RCT_EXPORT_METHOD(run)
#endif
@end`
    });
    const conditionalBridgeImport = extractObjectiveCFileFacts({
      filePath: "ios/RawImportModule.m",
      language: "objc",
      sourceText: `#if ENABLE_REACT_NATIVE
#import <React/RCTBridgeModule.h>
#endif
@implementation RawImportModule
RCT_EXPORT_MODULE(RawImportModule)
RCT_EXPORT_METHOD(run)
@end`
    });

    expect(conditionalClass.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
    expect(conditionalMacro.reactNativeFacts?.nativeMethods ?? []).toEqual([]);
    expect(conditionalBridgeImport.reactNativeFacts?.nativeMethods ?? []).toEqual([]);
  });

  it("recognizes conditionals after comments and C preprocessing whitespace", () => {
    for (const prefix of ["/**/ ", "\f", "\v"] as const) {
      const deadClass = extractObjectiveCFileFacts({
        filePath: "src/Dead.m",
        language: "objc",
        sourceText: `${prefix}#if 0
@interface Dead : NSObject
@end
#endif
@interface Live : NSObject
@end`
      });
      const conditionalImport = extractObjectiveCFileFacts({
        filePath: "ios/ConditionalImport.m",
        language: "objc",
        sourceText: `${prefix}#if ENABLE_REACT_NATIVE
#import <React/RCTBridgeModule.h>
#endif
@implementation ConditionalImport
RCT_EXPORT_MODULE(ConditionalImport)
RCT_EXPORT_METHOD(run)
@end`
      });
      const conditionalMacros = extractObjectiveCFileFacts({
        filePath: "ios/ConditionalMacros.m",
        language: "objc",
        sourceText: `#import <React/RCTBridgeModule.h>
@implementation ConditionalMacros
${prefix}#if ENABLE_EXPORT
RCT_EXPORT_MODULE(ConditionalMacros)
RCT_EXPORT_METHOD(run)
#endif
@end`
      });

      expect(
        deadClass.symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.name),
        prefix
      ).toEqual(["Live"]);
      expect(
        conditionalImport.symbols.some(
          (symbol) => symbol.kind === "class" && symbol.name === "ConditionalImport"
        ),
        prefix
      ).toBe(true);
      expect(
        conditionalMacros.symbols.some(
          (symbol) => symbol.kind === "class" && symbol.name === "ConditionalMacros"
        ),
        prefix
      ).toBe(true);
      expect(conditionalImport.reactNativeFacts?.nativeMethods ?? [], prefix).toEqual([]);
      expect(conditionalMacros.reactNativeFacts?.nativeMethods ?? [], prefix).toEqual([]);
    }
  });

  it("keeps directive-like strings and line comments inert", () => {
    const facts = extractObjectiveCFileFacts({
      filePath: "ios/InertDirectives.m",
      language: "objc",
      sourceText: `const char *marker = "#if 0";
// #if 0
#import <React/RCTBridgeModule.h>
@implementation InertDirectives
RCT_EXPORT_MODULE(InertDirectives)
RCT_EXPORT_METHOD(run)
@end`
    });

    expect(facts.symbols.some((symbol) => symbol.kind === "class" && symbol.name === "InertDirectives")).toBe(true);
    expect(facts.reactNativeFacts?.nativeMethods).toEqual([
      expect.objectContaining({ moduleName: "InertDirectives", methodName: "run" })
    ]);
  });

  it("retains unconditional Objective-C and React Native positives", () => {
    const facts = extractObjectiveCFileFacts({
      filePath: "ios/CalendarModule.m",
      language: "objc",
      sourceText: `#import <React/RCTBridgeModule.h>
@interface CalendarModule : NSObject
- (void)declared;
@end
@implementation CalendarModule
- (void)declared {} /* comment suffix is inert */
RCT_EXPORT_MODULE(CalendarModule)
RCT_EXPORT_METHOD(createEvent)
@end`
    });

    expect(facts.symbols.some((symbol) => symbol.kind === "class" && symbol.name === "CalendarModule")).toBe(true);
    expect(facts.symbols.some((symbol) => symbol.kind === "method" && symbol.name === "declared")).toBe(true);
    expect(facts.reactNativeFacts?.nativeMethods).toEqual([
      expect.objectContaining({ moduleName: "CalendarModule", methodName: "createEvent" })
    ]);
  });

  it("fails closed for malformed Objective-C structure and preprocessor stacks", () => {
    const malformedSources = [
      `@implementation Broken\n- (void)run { [self helper; }\n@end`,
      `@implementation Broken\n- (void)run( {}\n@end`,
      `@interface Broken : NSObject\n@end\n@end`,
      `#if FEATURE\n@interface Broken : NSObject\n@end`,
      `#else\n@interface Broken : NSObject\n@end`,
      `#if FEATURE\n#else\n#else\n#endif\n@interface Broken : NSObject\n@end`
    ] as const;

    for (const sourceText of malformedSources) {
      const facts = extractObjectiveCFileFacts({ filePath: "src/Broken.m", language: "objc", sourceText });
      expect(facts.symbols.map((symbol) => symbol.kind), sourceText).toEqual(["file"]);
      expect(facts.edges, sourceText).toEqual([]);
    }
  });

  it("fails closed when a direct Objective-C method has a same-line suffix", () => {
    const malformedSources = [
      `@implementation SameLine\n- (void)run {} + (void)run {}\n@end`,
      `@implementation SameLine\n- (void)run {} - (void)run {}\n@end`,
      `@protocol SameLine\n- (void)run; + (void)run;\n@end`
    ] as const;

    for (const sourceText of malformedSources) {
      const facts = extractObjectiveCFileFacts({ filePath: "src/SameLine.m", language: "objc", sourceText });
      expect(facts.symbols.map((symbol) => symbol.kind), sourceText).toEqual(["file"]);
      expect(facts.edges, sourceText).toEqual([]);
    }
  });

  it("emits only one exact Solidity same-contract private zero-argument internal call", () => {
    const facts = extractSolidityFileFacts({
      filePath: "src/Smoke.sol",
      language: "solidity",
      sourceText: `contract Smoke {
  function entry() external { helper(); }
  function helper() private {}
}`
    });
    const entry = symbolByName(facts, "method", "entry");
    const helper = symbolByName(facts, "method", "helper");

    expect(relations(facts, "calls")).toEqual([
      expect.objectContaining({
        sourceId: entry.id,
        targetId: helper.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "helper",
        evidence: {
          ruleId: "syntax.solidity.same-contract.unique-private-zero-argument-function-call",
          stage: "syntax",
          candidateSymbolIds: [helper.id]
        }
      })
    ]);
  });

  it("fails closed for Objective-C dynamic dispatch and Solidity visibility, ownership, and shadowing hazards", () => {
    const objectiveCSources = [
      `@implementation Smoke (Category)\n- (void)entry { [self helper]; }\n- (void)helper {}\n@end`,
      `@interface Child : Parent\n- (void)helper;\n@end\n@implementation Child\n- (void)entry { [self helper]; }\n- (void)helper {}\n@end`,
      `@implementation Smoke\n- (void)entry { [self helper]; }\n- (void)helper {}\n@end`
    ] as const;
    for (const sourceText of objectiveCSources) {
      expect(
        relations(extractObjectiveCFileFacts({ filePath: "src/Smoke.m", language: "objc", sourceText }), "calls")
      ).toEqual([]);
    }

    const soliditySources = [
      `import "./Foreign.sol";\ncontract Smoke { function entry() external { helper(); } function helper() private {} }`,
      `contract Smoke is Base { function entry() external { helper(); } function helper() private {} }`,
      `contract Smoke { using Utils for uint; function entry() external { helper(); } function helper() private {} }`,
      `library Smoke { function entry() internal { helper(); } function helper() private {} }`,
      `contract Smoke { function entry() external { helper.delegatecall(\"\"); } function helper() private {} }`,
      `contract Smoke { function entry() external { helper(); } function helper() private {} function helper(uint value) private {} }`,
      `contract Smoke { function entry() external { function() internal helper; helper(); } function helper() private {} }`,
      `contract Smoke { function entry(function() internal helper) external { helper(); } function helper() private {} }`,
      `contract Smoke { function entry() external returns (function() internal helper) { helper(); } function helper() private {} }`,
      `contract Smoke { function entry() external { assembly { caller() } } function caller() private {} }`,
      `contract Smoke { function entry() external { helper(); } function helper() private {} }\ncontract Other { function helper() private {} }`
    ] as const;
    for (const sourceText of soliditySources) {
      expect(
        relations(extractSolidityFileFacts({ filePath: "src/Smoke.sol", language: "solidity", sourceText }), "calls"),
        sourceText
      ).toEqual([]);
    }
  });
});
