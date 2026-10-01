import { describe, expect, it } from "vitest";
import { identifierWords } from "../../src/domain/identifier-search.js";

describe("identifier words", () => {
  it.each([
    ["abc", ["abc"]], ["abc123", ["abc123"]], ["123", ["123"]],
    ["", []], ["abc\n", ["abc"]], ["abc\r\n", ["abc"]],
    ["abc\u2028", ["abc"]], ["abc\u2029", ["abc"]], [" abc ", ["abc"]],
    ["snake_case", ["snake", "case"]], ["camelCase", ["camel", "case"]],
    ["HTTPServer", ["http", "server"]], ["abc123Value", ["abc123", "value"]],
    ["ｆｏｏ１２３", ["foo123"]], ["StraßeValue", ["straße", "value"]],
    ["Kelvin", ["kelvin"]], ["foo٣bar", ["foo٣bar"]], ["foo💡bar", ["foo", "bar"]]
  ] as const)("preserves word boundaries for %j", (value, expected) => {
    expect(identifierWords(value)).toEqual(expected);
  });
});
