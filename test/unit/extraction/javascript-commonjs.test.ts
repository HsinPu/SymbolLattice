import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("JavaScript CommonJS extraction", () => {
  it("extracts a named class assigned directly to module.exports and literal local requires", () => {
    const facts = extractFileFacts({
      filePath: "lib/application.js",
      language: "javascript",
      sourceText: [
        "'use strict'",
        "const Emitter = require('node:events')",
        "const request = require('./request')",
        "module.exports = class Application extends Emitter {",
        "  create () { return request.create() }",
        "}",
        "module.exports.HttpError = Error",
        ""
      ].join("\n")
    });

    const application = facts.symbols.find(
      (symbol) => symbol.kind === "class" && symbol.name === "Application"
    );
    expect(application).toMatchObject({
      qualifiedName: "lib/application.js#Application",
      isExported: true,
      declarationOrdinal: 0
    });
    expect(
      facts.pendingReferences.map((reference) => [
        reference.sourceId,
        reference.relationKind,
        reference.referenceName
      ])
    ).toEqual(
      expect.arrayContaining([
        [expect.any(String), "imports", "node:events"],
        [expect.any(String), "imports", "./request"],
        [application?.id, "extends", "Emitter"]
      ])
    );
    expect(facts.exportBindings).toEqual([
      expect.objectContaining({ localName: "Application", exportedName: "default" })
    ]);
  });

  it("treats the cjs extension as an explicit CommonJS contract without a strict directive", () => {
    const facts = extractFileFacts({
      filePath: "lib/application.cjs",
      language: "javascript",
      sourceText: [
        "const request = require('./request')",
        "module.exports = class Application {",
        "  create () { return request.create() }",
        "}",
        ""
      ].join("\n")
    });

    const application = facts.symbols.find(
      (symbol) => symbol.kind === "class" && symbol.name === "Application"
    );
    expect(application).toMatchObject({
      qualifiedName: "lib/application.cjs#Application",
      isExported: true
    });
    expect(facts.pendingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationKind: "imports", referenceName: "./request" })
      ])
    );
  });

  it("keeps a direct top-level literal require when another function contains a dynamic require", () => {
    const facts = extractFileFacts({
      filePath: "lib/mixed-requires.js",
      language: "javascript",
      sourceText: [
        "'use strict'",
        "require('./hooks').runner = function stub() {}",
        "const request = require('./request')",
        "function lazy(name) { return require(name) }"
      ].join("\n")
    });

    expect(facts.pendingReferences.filter((reference) => reference.relationKind === "imports")).toEqual([
      expect.objectContaining({ referenceName: "./request" })
    ]);
  });

  it("rejects direct requires when require is hoisted or reassigned in the source file", () => {
    for (const sourceText of [
      "'use strict'; if (false) { var require }; const request = require('./request')",
      "'use strict'; const request = require('./request'); require = other",
      "'use strict'; const request = require('./request'); ({ require } = other)",
      "'use strict'; const request = require('./request'); [require] = other"
    ]) {
      const facts = extractFileFacts({ filePath: "lib/unsafe-require.js", language: "javascript", sourceText });
      expect(facts.pendingReferences.filter((reference) => reference.relationKind === "imports")).toEqual([]);
    }
  });

  it("fails closed for shadowed CommonJS globals and non-literal or nested shapes", () => {
    const cases = [
      [
        "shadowed module",
        "const module = { exports: null }; module.exports = class Application {}"
      ],
      [
        "shadowed require",
        "function require(value) { return value }\nconst request = require('./request')"
      ],
      ["dynamic require", "const path = './request'; const request = require(path)"],
      [
        "nested export assignment",
        "function install() { module.exports = class Application {} }"
      ],
      [
        "esm source",
        "'use strict'; export const marker = true; module.exports = class Application {}"
      ],
      [
        "hoisted require mutation",
        "'use strict'; if (false) { var require }; const request = require('./request')"
      ],
      [
        "extra module mutation",
        "'use strict'; module.exports = class Application {}; Object.defineProperty(module, 'exports', { value: null })"
      ],
      [
        "non-strict CommonJS",
        "const request = require('./request'); module.exports = class Application {}"
      ],
      [
        "misplaced strict string",
        "void 0; 'use strict'; const request = require('./request'); module.exports = class Application {}"
      ]
    ] as const;

    for (const [label, sourceText] of cases) {
      const facts = extractFileFacts({
        filePath: `lib/${label.replaceAll(" ", "-")}.js`,
        language: "javascript",
        sourceText
      });
      expect(
        facts.symbols.filter((symbol) => symbol.kind === "class" && symbol.name === "Application"),
        label
      ).toEqual([]);
      expect(
        facts.pendingReferences.filter((reference) => reference.relationKind === "imports"),
        label
      ).toEqual([]);
    }
  });
});
