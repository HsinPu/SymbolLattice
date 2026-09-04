import { describe, expect, it } from "vitest";

import { extractSolidityFileFacts } from "../../../src/extraction/solidity.js";

function calls(sourceText: string) {
  return extractSolidityFileFacts({
    filePath: "contracts/Concrete.sol",
    language: "solidity",
    sourceText
  }).edges.filter((edge) => edge.kind === "calls");
}

describe("Solidity relations v0.505", () => {
  it("links every fixed-arity bare call to one same-contract private function", () => {
    const edges = calls(`import {Base} from "./Base.sol";

contract Concrete is Base {
  function first(uint256 value) external { _record(value, address(this)); }
  function second() external {
    _record(type(uint256).max, address(0));
    _record(1 + nested(2, 3), address(this));
  }
  function _record(uint256 value, address account) private {}
}`);

    expect(edges).toHaveLength(3);
    expect(edges.map((edge) => edge.referenceName)).toEqual(["_record", "_record", "_record"]);
    expect(edges).toEqual(edges.map((edge) => expect.objectContaining({
      resolution: "exact",
      confidence: 1,
      evidence: expect.objectContaining({
        ruleId: "syntax.solidity.same-contract.unique-private-fixed-arity-function-call",
        stage: "syntax"
      })
    })));
  });

  it("counts a masked string literal as one fixed-arity argument", () => {
    expect(calls(`contract C {
  function entry() external { _notice("text (with punctuation), still one argument"); }
  function _notice(string memory text) private {}
}`)).toEqual([
      expect.objectContaining({ referenceName: "_notice", resolution: "exact", confidence: 1 })
    ]);
  });

  it("keeps internal, overloaded, qualified, shadowed, assembly, and malformed calls unresolved", () => {
    const sources = [
      `contract C { function entry(uint x) external { helper(x); } function helper(uint x) internal {} }`,
      `contract C { function entry(uint x) external { helper(x); } function helper(uint x) private {} function helper(address x) private {} }`,
      `contract C { function entry(uint helper) external { helper(1); } function helper(uint x) private {} }`,
      `contract C { function entry(C other) external { other.helper(1); } function helper(uint x) private {} }`,
      `contract C { function entry() external { assembly { helper() } } function helper() private {} }`,
      `contract C { function entry() external { helper(1); } function helper(uint x) private {}`
    ];
    for (const sourceText of sources) expect(calls(sourceText), sourceText).toEqual([]);
  });
});
