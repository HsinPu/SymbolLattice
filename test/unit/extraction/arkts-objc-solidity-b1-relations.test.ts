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
