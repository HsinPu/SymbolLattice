import { describe, expect, it } from "vitest";

import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { extractLuaFileFacts } from "../../../src/extraction/lua.js";
import { extractPascalFileFacts } from "../../../src/extraction/pascal.js";

function functionByName(facts: ArtifactFacts, name: string): SymbolNode {
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

function routes(facts: ArtifactFacts) {
  return facts.edges.filter((edge) => edge.kind === "routes");
}

describe("Lua, Luau, and Pascal bounded same-file direct calls", () => {
  it("keeps Lua local function symbols without claiming a direct call", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/smoke.lua",
      language: "lua",
      sourceText: `local function luaHelper()
end

local function luaEntry()
  luaHelper()
end`
    });
    expect(functionByName(facts, "luaEntry")).toBeDefined();
    expect(functionByName(facts, "luaHelper")).toBeDefined();

    expect(calls(facts)).toEqual([]);
  });

  it("keeps Lua debug aliases fail-closed and retains an exact Lapis route handler", () => {
    const aliasedReflection = extractLuaFileFacts({
      filePath: "src/alias.lua",
      language: "lua",
      sourceText: `local function helper() end
local debugAlias = debug
local function entry() debugAlias.setupvalue(function() end, 1, helper); helper() end`
    });
    expect(calls(aliasedReflection)).toEqual([]);

    const facts = extractLuaFileFacts({
      filePath: "src/routes.lua",
      language: "lua",
      sourceText: `local app = require("lapis").Application()
local function lapisHandler()
end
app:get("/smoke", lapisHandler)`
    });
    const handler = functionByName(facts, "lapisHandler");

    expect(calls(facts)).toEqual([]);
    expect(routes(facts)).toEqual([
      expect.objectContaining({
        targetId: handler.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "lapisHandler",
        evidence: {
          ruleId: "framework.lapis.direct-application.literal-route.local-function",
          stage: "syntax",
          candidateSymbolIds: [handler.id]
        }
      })
    ]);
  });

  it("emits one exact Luau typed zero-argument bare-function call with unique target evidence", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/smoke.luau",
      language: "luau",
      sourceText: `local function luauHelper(): number
  return 1
end

local function luauEntry(): number
  return luauHelper()
end`
    });
    const caller = functionByName(facts, "luauEntry");
    const callee = functionByName(facts, "luauHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "luauHelper",
        evidence: {
          ruleId: "syntax.luau.same-file.unique-zero-argument-bare-function-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("emits one exact Pascal zero-argument bare routine call with unique target evidence", () => {
    const facts = extractPascalFileFacts({
      filePath: "src/smoke.pas",
      language: "pascal",
      sourceText: `program Smoke;

procedure pascalHelper;
begin
end;

procedure pascalEntry;
begin
  pascalHelper();
end;

begin
end.`
    });
    const caller = functionByName(facts, "pascalEntry");
    const callee = functionByName(facts, "pascalHelper");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "pascalHelper",
        evidence: {
          ruleId: "syntax.pascal.same-file.unique-zero-argument-bare-routine-call",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for Lua and Luau shadowing, imports, members, environment mutation, duplicates, and nested closures", () => {
    const sources = [
      ["local shadow", `local function helper() end\nlocal function entry() local helper = function() end; helper() end`],
      ["global shadow", `function helper() end\nhelper = function() end\nfunction entry() helper() end`],
      ["parameter shadow", `local function helper() end\nlocal function entry(helper) helper() end`],
      ["table member", `local function helper() end\nlocal function entry() holder.helper() end`],
      ["method sugar", `local function helper() end\nlocal function entry() holder:helper() end`],
      ["require binding", `local function helper() end\nlocal helper = require("foreign")\nlocal function entry() helper() end`],
      ["import binding", `local function helper() end\nlocal helper = import("foreign")\nlocal function entry() helper() end`],
      ["metatable", `local function helper() end\nsetmetatable(_G, { __index = function() end })\nlocal function entry() helper() end`],
      ["setfenv", `local function helper() end\nsetfenv(1, {})\nlocal function entry() helper() end`],
      ["_ENV", `local function helper() end\nlocal _ENV = {}\nlocal function entry() helper() end`],
      ["helper assignment before caller", `local function helper() end\nhelper = function() end\nlocal function entry() helper() end`],
      ["helper assignment after caller", `local function helper() end\nlocal function entry() helper() end\nhelper = function() end`],
      ["local helper redeclaration before caller", `local function helper() end\nlocal helper = function() end\nlocal function entry() helper() end`],
      ["local helper redeclaration after caller", `local function helper() end\nlocal function entry() helper() end\nlocal helper = function() end`],
      ["debug setupvalue before caller", `local function helper() end\ndebug.setupvalue(function() end, 1, helper)\nlocal function entry() helper() end`],
      ["debug setupvalue after caller", `local function helper() end\nlocal function entry() helper() end\ndebug.setupvalue(function() end, 1, helper)`],
      ["caller assignment", `local function helper() end\nlocal function entry() helper = function() end; helper() end`],
      ["caller multiple assignment", `local function helper() end\nlocal function entry() local other; helper, other = function() end, 1; helper() end`],
      ["other function mutation", `local function helper() end\nlocal function mutate() helper = function() end\nlocal function entry() helper() end`],
      ["caller debug reflection", `local function helper() end\nlocal function entry() debug.setupvalue(function() end, 1, helper); helper() end`],
      ["inner debug reflection", `local function helper() end\nlocal function entry() local nested = function() debug.setupvalue(function() end, 1, helper) end; helper() end`],
      ["duplicate target", `local function helper() end\nlocal function helper() end\nlocal function entry() helper() end`],
      ["nested closure", `local function helper() end\nlocal function entry() local callback = function() helper() end; callback() end`]
    ] as const;

    for (const language of ["lua", "luau"] as const) {
      for (const [description, sourceText] of sources) {
        const extension = language === "lua" ? "lua" : "luau";
        const facts = extractLuaFileFacts({ filePath: `src/smoke.${extension}`, language, sourceText });
        expect(calls(facts), `${language}: ${description}`).toEqual([]);
      }
    }
  });

  it("fails closed for Pascal unit or uses scope, ownership, forward or external declarations, overloads, nested or local routines, qualified or member calls, and with", () => {
    const sources = [
      ["unit scope", `unit Smoke;\ninterface\nprocedure pascalHelper;\nimplementation\nprocedure pascalEntry; begin pascalHelper(); end;\nprocedure pascalHelper; begin end;\nend.`],
      ["forward", `procedure pascalHelper; forward;\nprocedure pascalEntry; begin pascalHelper(); end;\nprocedure pascalHelper; begin end;`],
      ["external", `procedure pascalHelper; external;\nprocedure pascalEntry; begin pascalHelper(); end;\nprocedure pascalHelper; begin end;`],
      ["overload", `procedure pascalEntry; begin pascalHelper(); end;\nprocedure pascalHelper; begin end;\nprocedure pascalHelper(value: Integer); begin end;`],
      ["nested routine", `procedure pascalEntry;\n  procedure pascalHelper; begin end;\nbegin\n  pascalHelper();\nend;\nprocedure pascalHelper; begin end;`],
      ["local value", `procedure pascalEntry; var pascalHelper: Integer; begin pascalHelper(); end;\nprocedure pascalHelper; begin end;`],
      ["qualified call", `procedure pascalEntry; begin Foreign.pascalHelper(); end;\nprocedure pascalHelper; begin end;`],
      ["member call", `procedure pascalEntry; begin holder.pascalHelper(); end;\nprocedure pascalHelper; begin end;`],
      ["with", `procedure pascalEntry; begin with holder do pascalHelper(); end;\nprocedure pascalHelper; begin end;`],
      ["nested block shadow", `procedure pascalHelper;\nbegin\nend;\n\nprocedure pascalEntry;\nbegin\n  begin\n    var pascalHelper: Integer;\n    pascalHelper();\n  end;\nend;`],
      ["nested loop shadow", `procedure pascalHelper;\nbegin\nend;\n\nprocedure pascalEntry;\nbegin\n  for pascalHelper := 1 to 1 do\n  begin\n    pascalHelper();\n  end;\nend;`],
      ["owned routine", `procedure Helper;\nbegin\nend;\n\nprocedure TFoo.Helper;\nbegin\nend;\n\nprocedure TFoo.Entry;\nbegin\n  Helper();\nend;`],
      ["uses with later declaration", `uses Foreign;\n\nprocedure pascalHelper;\nbegin\nend;\n\nprocedure pascalEntry;\nbegin\n  pascalHelper();\nend;`],
      ["curly compiler I include", `program Smoke;\n{$I shared.inc}\n\nprocedure pascalHelper;\nbegin\nend;\n\nprocedure pascalEntry;\nbegin\n  pascalHelper();\nend;\n\nbegin\nend.`],
      ["curly compiler INCLUDE", `program Smoke;\n{$INCLUDE shared.inc}\n\nprocedure pascalHelper;\nbegin\nend;\n\nprocedure pascalEntry;\nbegin\n  pascalHelper();\nend;\n\nbegin\nend.`],
      ["parenthesized compiler I include", `program Smoke;\n(*$I shared.inc*)\n\nprocedure pascalHelper;\nbegin\nend;\n\nprocedure pascalEntry;\nbegin\n  pascalHelper();\nend;\n\nbegin\nend.`],
      ["parenthesized compiler INCLUDE", `program Smoke;\n(*$INCLUDE shared.inc*)\n\nprocedure pascalHelper;\nbegin\nend;\n\nprocedure pascalEntry;\nbegin\n  pascalHelper();\nend;\n\nbegin\nend.`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractPascalFileFacts({ filePath: "src/smoke.pas", language: "pascal", sourceText });
      expect(calls(facts), description).toEqual([]);
    }
  });
});
