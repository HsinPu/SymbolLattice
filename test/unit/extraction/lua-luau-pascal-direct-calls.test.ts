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

  it("retains an exact Lapis route before a terminal return app", () => {
    const sources = [
      `local app = require("lapis").Application()
local function handler() end
app:get("/return-newline", handler)
return app`,
      `local app = require("lapis").Application()
local function handler() end
app:get("/return-semicolon", handler); return app`
    ] as const;

    for (const sourceText of sources) {
      const facts = extractLuaFileFacts({ filePath: "src/routes.lua", language: "lua", sourceText });
      expect(routes(facts)).toHaveLength(1);
    }
  });

  it("emits exact official-shaped Lapis inline handlers with stable identity, ranges, containment, and route evidence", () => {
    const sourceText = `local lapis = require("lapis")
local app = lapis.Application()

app:enable("etlua") -- route-neutral template setup

app:get("/hello", function(self)
  return { render = "hello" }
end)

app:post("create", "/items", function(self)
  local nested = function()
    return "nested"
  end
  return { json = nested() }
end)

app:match("/fallback", function()
  return { status = 204 }
end)
return app`;
    const facts = extractLuaFileFacts({
      filePath: "src/routes.lua",
      language: "lua",
      sourceText
    });
    const handlers = facts.symbols.filter(
      (symbol) => symbol.kind === "function" && symbol.name === "<anonymous route handler>"
    );
    const routeSymbols = facts.symbols.filter((symbol) => symbol.kind === "route");

    expect(handlers).toEqual([
      expect.objectContaining({
        id: "symbol:src%2Froutes.lua:src%2Froutes.lua%23route%3AGET%20%2Fhello%23handler:function:0",
        qualifiedName: "src/routes.lua#route:GET /hello#handler",
        range: {
          start: { line: 6, column: 19 },
          end: { line: 8, column: 4 }
        },
        isExported: false,
        declarationOrdinal: 0
      }),
      expect.objectContaining({
        id: "symbol:src%2Froutes.lua:src%2Froutes.lua%23route%3APOST%20%2Fitems%23handler:function:0",
        qualifiedName: "src/routes.lua#route:POST /items#handler",
        range: {
          start: { line: 10, column: 30 },
          end: { line: 15, column: 4 }
        },
        isExported: false,
        declarationOrdinal: 0
      }),
      expect.objectContaining({
        id: "symbol:src%2Froutes.lua:src%2Froutes.lua%23route%3AALL%20%2Ffallback%23handler:function:0",
        qualifiedName: "src/routes.lua#route:ALL /fallback#handler",
        range: {
          start: { line: 17, column: 24 },
          end: { line: 19, column: 4 }
        },
        isExported: false,
        declarationOrdinal: 0
      })
    ]);
    expect(routeSymbols.map((symbol) => symbol.qualifiedName)).toEqual([
      "src/routes.lua#route:GET /hello",
      "src/routes.lua#route:POST /items",
      "src/routes.lua#route:ALL /fallback"
    ]);
    expect(
      facts.edges
        .filter(
          (edge) =>
            edge.kind === "contains" &&
            handlers.some((handler) => handler.id === edge.targetId) &&
            edge.sourceId === facts.symbols[0]?.id
        )
        .map((edge) => edge.targetId)
    ).toEqual(handlers.map((handler) => handler.id));
    expect(routes(facts)).toEqual(
      handlers.map((handler) =>
        expect.objectContaining({
          targetId: handler.id,
          resolution: "exact",
          confidence: 1,
          referenceName: "<anonymous route handler>",
          evidence: {
            ruleId: "framework.lapis.direct-application.literal-route.inline-function",
            stage: "syntax",
            candidateSymbolIds: [handler.id]
          }
        })
      )
    );
  });

  it("uses lexical ordinals for duplicate Lapis inline route and handler identities", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/routes.lua",
      language: "lua",
      sourceText: `local app = require("lapis").Application()
app:get("/duplicate", function() return { status = 200 } end);
app:get("/duplicate", function() return { status = 201 } end)`
    });
    const handlers = facts.symbols.filter(
      (symbol) => symbol.kind === "function" && symbol.name === "<anonymous route handler>"
    );
    const routeSymbols = facts.symbols.filter((symbol) => symbol.kind === "route");

    expect(handlers.map(({ id, qualifiedName, declarationOrdinal }) => ({ id, qualifiedName, declarationOrdinal }))).toEqual([
      {
        id: "symbol:src%2Froutes.lua:src%2Froutes.lua%23route%3AGET%20%2Fduplicate%23handler:function:0",
        qualifiedName: "src/routes.lua#route:GET /duplicate#handler",
        declarationOrdinal: 0
      },
      {
        id: "symbol:src%2Froutes.lua:src%2Froutes.lua%23route%3AGET%20%2Fduplicate%23handler:function:1",
        qualifiedName: "src/routes.lua#route:GET /duplicate#handler",
        declarationOrdinal: 1
      }
    ]);
    expect(routeSymbols.map(({ qualifiedName, declarationOrdinal }) => ({ qualifiedName, declarationOrdinal }))).toEqual([
      { qualifiedName: "src/routes.lua#route:GET /duplicate", declarationOrdinal: 0 },
      { qualifiedName: "src/routes.lua#route:GET /duplicate", declarationOrdinal: 1 }
    ]);
    expect(routes(facts).map((edge) => edge.targetId)).toEqual(handlers.map((handler) => handler.id));
  });

  it("accepts the bounded official Lapis return-expression subset", () => {
    const facts = extractLuaFileFacts({
      filePath: "src/routes.lua",
      language: "lua",
      sourceText: `local app = require("lapis").Application()
app:get("/hello/:name", function(self)
  return "Hello " .. self.params.name
end)
return app`
    });

    expect(routes(facts)).toEqual([
      expect.objectContaining({
        resolution: "exact",
        confidence: 1,
        referenceName: "<anonymous route handler>"
      })
    ]);
  });

  it("fails closed for unsafe or non-direct Lapis inline handler registrations", () => {
    const sources = [
      ["dynamic path", `local app = require("lapis").Application()\napp:get(path, function() end)`],
      ["wrapped handler", `local app = require("lapis").Application()\napp:get("/x", wrap(function() end))`],
      ["invoked handler", `local app = require("lapis").Application()\napp:get("/x", (function() end)())`],
      ["extra handler argument", `local app = require("lapis").Application()\napp:get("/x", function() end, extra)`],
      ["nonfinal handler", `local app = require("lapis").Application()\napp:get("/x", function() end, "later")`],
      ["nested route", `local app = require("lapis").Application()\nif true then\n  app:get("/x", function() end)\nend`],
      ["dot route", `local app = require("lapis").Application()\napp.get("/x", function() end)`],
      ["bracket route", `local app = require("lapis").Application()\napp["get"]("/x", function() end)`],
      ["application rebinding", `local app = require("lapis").Application()\napp = other\napp:get("/x", function() end)`],
      ["multiple applications", `local one = require("lapis").Application()\nlocal two = require("lapis").Application()\none:get("/x", function() end)`],
      ["top-level foreign return", `local app = require("lapis").Application()\napp:get("/x", function() end)\nreturn other`],
      ["nonterminal application return", `local app = require("lapis").Application()\nreturn app\napp:get("/x", function() end)`],
      ["enable wrong value", `local app = require("lapis").Application()\napp:enable("other")\napp:get("/x", function() end)`],
      ["enable twice", `local app = require("lapis").Application()\napp:enable("etlua")\napp:enable("etlua")\napp:get("/x", function() end)`],
      ["enable after route", `local app = require("lapis").Application()\napp:get("/x", function() end)\napp:enable("etlua")`],
      ["missing parameter comma", `local app = require("lapis").Application()\napp:get("/x", function(self other) end)`],
      ["repeated parameter comma", `local app = require("lapis").Application()\napp:get("/x", function(self,,other) end)`],
      ["missing return expression comma", `local app = require("lapis").Application()\napp:get("/x", function() return 1 2 end)`],
      ["missing local name", `local app = require("lapis").Application()\napp:get("/x", function() local = 1 end)`],
      ["missing local expression comma", `local app = require("lapis").Application()\napp:get("/x", function() local x = 1 2 end)`],
      ["repeated return comma", `local app = require("lapis").Application()\napp:get("/x", function() return 1,,2 end)`],
      ["missing table field value", `local app = require("lapis").Application()\napp:get("/x", function() return { a = } end)`],
      ["missing call argument", `local app = require("lapis").Application()\napp:get("/x", function() return foo(,) end)`],
      ["missing return value", `local app = require("lapis").Application()\napp:get("/x", function() return , end)`],
      ["break outside loop", `local app = require("lapis").Application()\napp:get("/x", function() break end)`],
      ["numeric call suffix", `local app = require("lapis").Application()\napp:get("/x", function() return 1() end)`],
      ["direct function call suffix", `local app = require("lapis").Application()\napp:get("/x", function() return function() end() end)`],
      ["non-vararg ellipsis", `local app = require("lapis").Application()\napp:get("/x", function() return ... end)`],
      ["spaced vararg parameter", `local app = require("lapis").Application()\napp:get("/x", function(. . .) return 1 end)`],
      ["repeated post-return semicolon", `local app = require("lapis").Application()\napp:get("/x", function() return;; end)`],
      ["malformed function", `local app = require("lapis").Application()\napp:get("/x", function()`]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractLuaFileFacts({ filePath: "src/routes.lua", language: "lua", sourceText });
      expect(routes(facts), description).toEqual([]);
    }

    const luauFacts = extractLuaFileFacts({
      filePath: "src/routes.luau",
      language: "luau",
      sourceText: `local app = require("lapis").Application()
app:get("/x", function() end)`
    });
    expect(routes(luauFacts)).toEqual([]);
  });

  it("fails closed for mutable Lapis construction, registration, and handler state", () => {
    const sources = [
      [
        "local require shadow before construction",
        `local require = function() return {} end
local app = require("lapis").Application()
local function handler() end
app:get("/shadow", handler)`
      ],
      [
        "global require shadow before construction",
        `require = function() return {} end
local app = require("lapis").Application()
local function handler() end
app:get("/shadow", handler)`
      ],
      [
        "route method assignment before registration",
        `local app = require("lapis").Application()
local function handler() end
app.get = function() end
app:get("/mutation", handler)`
      ],
      [
        "prior invoked handler mutation",
        `local app = require("lapis").Application()
local function handler() end
local function mutate() handler = function() end end
mutate()
app:get("/call", handler)`
      ],
      [
        "unmatched if",
        `local app = require("lapis").Application()
local function handler() end
if true
app:get("/if", handler)`
      ],
      [
        "stray elseif",
        `local app = require("lapis").Application()
local function handler() end
elseif true then
app:get("/elseif", handler)`
      ],
      [
        "local require function declaration before construction",
        `local function require() return {} end
local app = require("lapis").Application()
local function handler() end
app:get("/require-local-function", handler)`
      ],
      [
        "global require function declaration before construction",
        `function require() return {} end
local app = require("lapis").Application()
local function handler() end
app:get("/require-global-function", handler)`
      ],
      [
        "match method assignment before registration",
        `local app = require("lapis").Application()
local function handler() end
app.match = function() end
app:get("/match", handler)`
      ],
      [
        "bracket method assignment before registration",
        `local app = require("lapis").Application()
local function handler() end
app["get"] = function() end
app:get("/bracket", handler)`
      ],
      [
        "dotted mutator invocation before registration",
        `local app = require("lapis").Application()
local function handler() end
mutator.run()
app:get("/dotted-call", handler)`
      ],
      [
        "method mutator invocation before registration",
        `local app = require("lapis").Application()
local function handler() end
mutator:run()
app:get("/method-call", handler)`
      ],
      [
        "standalone else",
        `local app = require("lapis").Application()
local function handler() end
else
app:get("/else", handler)`
      ],
      [
        "standalone then",
        `local app = require("lapis").Application()
local function handler() end
then
app:get("/then", handler)`
      ],
      [
        "application local function shadow before registration",
        `local app = require("lapis").Application()
local function app() end
local function handler() end
app:get("/shadowed-app", handler)`
      ],
      [
        "module alias local function shadow before construction",
        `local lapis = require("lapis")
local function lapis() end
local app = lapis.Application()
local function handler() end
app:get("/shadowed-module", handler)`
      ],
      [
        "handler local function shadow before registration",
        `local app = require("lapis").Application()
local function handler() end
local function handler() end
app:get("/shadowed-handler", handler)`
      ],
      [
        "route after terminal return on a new line",
        `local app = require("lapis").Application()
local function handler() end
return app
app:get("/after-return", handler)`
      ],
      [
        "route after terminal return semicolon",
        `local app = require("lapis").Application()
local function handler() end
return app; app:get("/after-return-semicolon", handler)`
      ]
    ] as const;

    for (const [description, sourceText] of sources) {
      const facts = extractLuaFileFacts({ filePath: "src/routes.lua", language: "lua", sourceText });
      expect(routes(facts), description).toEqual([]);
    }
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
