import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

function snapshot(sourceText: string) {
  const document: SourceDocument = {
    absolutePath: "C:/project/src/sample.js",
    relativePath: "src/sample.js",
    language: "javascript",
    sourceText,
    contentHash: `fixture:${sourceText.length}`
  };
  return resolveProjectFacts({
    sourceDocuments: [document],
    extractedFiles: [extractFileFacts({ filePath: document.relativePath, language: "javascript", sourceText })],
    indexedAt: "2026-08-16T00:00:00.000Z"
  });
}

describe("JavaScript deep static relations", () => {
  it("fails malformed JavaScript closed to the file symbol instead of trusting parser recovery", () => {
    const cases = [
      "const express = require('express'); const app = express(; function health() {}; app.get('/x', health)",
      "class Target {}; function entry() { return new Target( }",
      "function entry(value = ) { return value() }",
      "const text = 'unterminated"
    ];
    for (const sourceText of cases) {
      const facts = extractFileFacts({ filePath: "src/malformed.cjs", language: "javascript", sourceText });
      expect(facts.symbols.map((symbol) => symbol.kind)).toEqual(["file"]);
      expect(facts.edges).toEqual([]);
      expect(facts.pendingReferences).toEqual([]);
    }
  });

  it("extracts literal Express and Fastify routes from immutable direct CommonJS package bindings", () => {
    for (const [filePath, sourceText, expected] of [
      [
        "src/express.cjs",
        [
          "const express = require('express');",
          "const app = express();",
          "function health() {}",
          "app.get('/health', health);"
        ].join("\n"),
        "GET /health"
      ],
      [
        "src/fastify.cjs",
        [
          "const fastify = require('fastify');",
          "const app = fastify();",
          "function health() {}",
          "app.get('/health', health);"
        ].join("\n"),
        "GET /health"
      ]
    ] as const) {
      const facts = extractFileFacts({ filePath, language: "javascript", sourceText });
      expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
        expected
      ]);
      expect(facts.pendingReferences.filter((reference) => reference.relationKind === "routes")).toEqual([
        expect.objectContaining({ referenceName: "health" })
      ]);
      const resolved = snapshot(`'use strict';\n${sourceText}`);
      expect(resolved.edges.filter((edge) => edge.kind === "routes")).toEqual([
        expect.objectContaining({ resolution: "exact", confidence: 1 })
      ]);
    }
  });

  it("fails closed for shadowed, dynamic, mutable, or ESM-mixed CommonJS framework factories", () => {
    const cases = [
      "function require(name) { return name }\nconst express = require('express'); const app = express(); app.get('/x', () => {})",
      "const name = 'express'; const express = require(name); const app = express(); app.get('/x', () => {})",
      "let express = require('express'); const app = express(); app.get('/x', () => {})",
      "const express = require('express'); express = other; const app = express(); app.get('/x', () => {})",
      "import marker from './marker.js'; const express = require('express'); const app = express(); app.get('/x', () => {})",
      "function setup(require) { const express = require('express'); const app = express(); function health() {}; app.get('/x', health) }",
      "function setup() { const express = require('express'); function require(name) { return name }; const app = express(); function health() {}; app.get('/x', health) }",
      "function setup() { const express = require('express'); const require = (name) => name; const app = express(); function health() {}; app.get('/x', health) }",
      "const express = require('express'); express.Router = other; const router = express.Router(); function health() {}; router.get('/x', health)",
      "const express = require('express'); Object.assign(express, { Router: other }); const router = express.Router(); function health() {}; router.get('/x', health)",
      "const express = require('express'); const alias = express; alias.Router = other; const router = express.Router(); function health() {}; router.get('/x', health)"
    ];
    for (const sourceText of cases) {
      const facts = extractFileFacts({ filePath: "src/unsafe.cjs", language: "javascript", sourceText });
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
      expect(facts.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    }
  });

  it("projects one same-file Express router through one literal mount prefix", () => {
    const facts = extractFileFacts({
      filePath: "src/routes.cjs",
      language: "javascript",
      sourceText: [
        "const express = require('express');",
        "const app = express();",
        "const router = express.Router();",
        "function health() {}",
        "router.get('/health', health);",
        "app.use('/api', router);"
      ].join("\n")
    });
    expect(facts.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual([
      "GET /api/health"
    ]);
  });

  it("suppresses Express child routes for dynamic, duplicate, or cyclic mounts", () => {
    const cases = [
      "app.use(prefix, router);",
      "app.use('/api', router); app.use('/v2', router);",
      "app.use('/api', router); app.use(router);",
      "app.use('/api', router); app.use('/v2', router, middleware);",
      "app.use('/api', router); foreign.use('/foreign', router);",
      "router.use('/loop', router);"
    ];
    for (const mount of cases) {
      const facts = extractFileFacts({
        filePath: "src/routes.cjs",
        language: "javascript",
        sourceText: [
          "const express = require('express');",
          "const app = express();",
          "const router = express.Router();",
          "function health() {}",
          "router.get('/health', health);",
          mount
        ].join("\n")
      });
      expect(facts.symbols.filter((symbol) => symbol.kind === "route")).toEqual([]);
    }
  });

  it("attributes a direct new expression in a local initializer to its enclosing function", () => {
    const graph = snapshot([
      "class Target {}",
      "function entry() {",
      "  const value = new Target();",
      "  return value;",
      "}"
    ].join("\n"));
    const entry = graph.symbols.find((symbol) => symbol.qualifiedName === "src/sample.js#entry");
    const target = graph.symbols.find((symbol) => symbol.qualifiedName === "src/sample.js#Target");

    expect(graph.edges.filter((edge) => edge.kind === "instantiates")).toEqual([
      expect.objectContaining({
        sourceId: entry?.id,
        targetId: target?.id,
        resolution: "exact",
        confidence: 1,
        evidence: expect.objectContaining({ candidateSymbolIds: [target?.id] })
      })
    ]);
  });

  it("keeps 150 shadowed, rebound, computed, and member candidates away from a top-level target", () => {
    const unsafeBodies = [
      "function entry(Target) { return new Target(); }",
      "function entry() { const Target = class {}; return new Target(); }",
      "function entry() { class Target {}; return new Target(); }",
      "function entry() { Target = class {}; return new Target(); }",
      "function entry() { return holder.Target(); }",
      "function entry() { return holder['Target'](); }"
    ];

    for (let index = 0; index < 150; index += 1) {
      const graph = snapshot(`class Target {}\n${unsafeBodies[index % unsafeBodies.length]}\n// case:${index}`);
      const topLevelTarget = graph.symbols.find(
        (symbol) => symbol.kind === "class" && symbol.qualifiedName === "src/sample.js#Target"
      );
      expect(
        graph.edges.filter(
          (edge) => edge.targetId === topLevelTarget?.id && (edge.kind === "calls" || edge.kind === "instantiates")
        ),
        `negative case ${index}`
      ).toEqual([]);
    }
  });
});
