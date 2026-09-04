import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";
import { Language, Parser } from "web-tree-sitter";

import { inspectLuaTree } from "../../../src/extraction/lua-worker-ast.js";

const encoder = new TextEncoder();
let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  const grammarBytes = await readFile(new URL(
    "../../../src/assets/lua/tree-sitter-lua-v0.5.0.wasm",
    import.meta.url
  ));
  const language = await Language.load(grammarBytes);
  parser = new Parser();
  parser.setLanguage(language);
});

describe("Lua worker grammar inspection", () => {
  it("claims only direct-root named plain, local, dotted, and colon functions", () => {
    const sourceText = `function plain() end
local function localName() end
function pkg.member() end
function pkg:method() end
if ready then
  function nested() end
end
assigned = function() end
local app = require("lapis").Application()
app:get("/health", function() end)
`;
    const sourceBytes = encoder.encode(sourceText);
    const tree = parser.parse(sourceText);
    expect(tree).not.toBeNull();

    const result = inspectLuaTree(tree!.rootNode, sourceBytes);

    expect(result.code).toBeNull();
    expect(result.declarations.map(({ name, form }) => ({ name, form }))).toEqual([
      { name: "plain", form: "plain-function" },
      { name: "localName", form: "local-function" },
      { name: "pkg.member", form: "dotted-function" },
      { name: "pkg:method", form: "colon-function" }
    ]);
    expect(result.declarations.map((declaration) => declaration.name)).not.toContain("nested");
    tree!.delete();
  });

  it("returns a syntax failure without partial declarations", () => {
    const sourceText = "function valid() end\nfunction broken(\n";
    const sourceBytes = encoder.encode(sourceText);
    const tree = parser.parse(sourceText);
    expect(tree).not.toBeNull();

    const result = inspectLuaTree(tree!.rootNode, sourceBytes);

    expect(result.code).toMatch(/^(ERROR|MISSING)$/u);
    expect(result.declarations).toEqual([]);
    tree!.delete();
  });

  it("retains one parser-proven direct call to an earlier unique local function", () => {
    const sourceText = [
      "local function target(value)",
      "  return value",
      "end",
      "local function caller()",
      "  return target(1)",
      "end"
    ].join("\n");
    const sourceBytes = encoder.encode(sourceText);
    const tree = parser.parse(sourceText);
    expect(tree).not.toBeNull();

    const result = inspectLuaTree(tree!.rootNode, sourceBytes) as unknown as {
      readonly calls: readonly { readonly name: string; readonly sourceDeclarationIndex: number; readonly targetDeclarationIndex: number }[];
    };

    expect(result.calls).toEqual([
      expect.objectContaining({ name: "target", sourceDeclarationIndex: 1, targetDeclarationIndex: 0 })
    ]);
    tree!.delete();
  });

  it("converts web-tree-sitter UTF-16 indexes to exact UTF-8 byte boundaries", () => {
    const sourceText = "local emoji = \"😀\"\r\nfunction café() end\r\n";
    const sourceBytes = encoder.encode(sourceText);
    const tree = parser.parse(sourceText);
    expect(tree).not.toBeNull();

    const result = inspectLuaTree(tree!.rootNode, sourceBytes);
    const declaration = result.declarations[0];
    const expectedStart = encoder.encode(sourceText.slice(0, sourceText.indexOf("function"))).byteLength;
    const expectedNameStart = encoder.encode(sourceText.slice(0, sourceText.indexOf("café"))).byteLength;

    expect(declaration).toMatchObject({
      name: "café",
      declarationStartByte: expectedStart,
      nameStartByte: expectedNameStart,
      nameEndByte: expectedNameStart + encoder.encode("café").byteLength
    });
    tree!.delete();
  });

  it("maps CRLF-normalized parser indexes back to exact raw byte boundaries", () => {
    const sourceText = "local generated = 'line \\\r\ncontinued'\r\nfunction café() end\r\n";
    const parserSourceText = sourceText.replaceAll("\r\n", "\n");
    const sourceBytes = encoder.encode(sourceText);
    const tree = parser.parse(parserSourceText);
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.hasError).toBe(false);

    const result = inspectLuaTree(tree!.rootNode, sourceBytes, parserSourceText);
    const declaration = result.declarations[0];
    const expectedStart = encoder.encode(sourceText.slice(0, sourceText.indexOf("function"))).byteLength;
    const expectedNameStart = encoder.encode(sourceText.slice(0, sourceText.indexOf("café"))).byteLength;

    expect(result.code).toBeNull();
    expect(declaration).toMatchObject({
      name: "café",
      declarationStartByte: expectedStart,
      nameStartByte: expectedNameStart,
      nameEndByte: expectedNameStart + encoder.encode("café").byteLength
    });
    tree!.delete();
  });
});
