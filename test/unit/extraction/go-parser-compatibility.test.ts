import { describe, expect, it } from "vitest";
import { parser as upstream } from "@lezer/go";
import { parser } from "../../../src/extraction/go-parser/parser.js";

function shape(source: string, candidate = parser) {
  const nodes: Array<{ name: string; from: number; to: number; error: boolean }> = [];
  candidate.parse(source).iterate({ enter(node) {
    nodes.push({ name: node.name, from: node.from, to: node.to, error: node.type.isError });
  } });
  return nodes;
}

describe("generated Go grammar preserves source coordinates and existing forms", () => {
  it.each([
    'package demo\nfunc f(xs []int) { for i := range xs { _ = i } }\n',
    'package demo\r\n// 中文 😀\r\nfunc f() { s := `for range x {}`; _ = s }\r\n',
    'package demo\nfunc f(x int) { if x > 0 { x++ }; switch x { case 1: return } }\n',
    'package demo\nfunc f(xs []int) { var i int; for i = range xs { _ = i } }\n'
  ])("has identical named nodes and spans for unchanged syntax: %s", source => {
    const old = shape(source, upstream);
    expect(old.some(node => node.error)).toBe(false);
    expect(shape(source)).toEqual(old);
  });

  it("keeps UTF-16 offsets and CRLF positions in the original bare-range source", () => {
    const source = 'package demo\r\n// 😀\r\nfunc f(xs []int) { for /* 字 */ range xs { f(xs) } }\r\n';
    const nodes = shape(source);
    expect(nodes.some(node => node.error)).toBe(false);
    const clause = nodes.find(node => node.name === "RangeClause");
    expect(clause).toMatchObject({ from: source.indexOf("range"), to: source.indexOf("xs { f") + 2 });
    const call = nodes.find(node => node.name === "CallExpr");
    expect(source.slice(call?.from, call?.to)).toBe("f(xs)");
  });

  it.each([
    "for range {}",
    "for range xs { @ }",
    "for range xs",
    "for range xs; xs {}"
  ])("retains parser errors for malformed input: %s", loop => {
    expect(shape(`package demo\nfunc f(xs []int) { ${loop} }\n`).some(node => node.error)).toBe(true);
  });
});
