import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalizeScopeRoots,
  discoverSourceFileFingerprints,
  discoverSourceFiles,
  discoverFreshnessProjectPaths,
  getSourceLanguage,
  hashSource,
  hashUtf8File,
  isUnsafeProjectPath,
  loadSourcePaths,
  MAXIMUM_SOURCE_CONCURRENT_READS,
  toProjectRelativePath
} from "../../../src/infrastructure/filesystem/discovery.js";
import {
  nativeProjectFilesystemReader,
  type ProjectFilesystemReader
} from "../../../src/infrastructure/filesystem/project-filesystem.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directoryPath) => {
      const { rm } = await import("node:fs/promises");
      await rm(directoryPath, { recursive: true, force: true });
    })
  );
});

describe("source discovery", () => {
  it("routes HTML and HTM files to the HTML extractor", () => {
    expect(getSourceLanguage("web/index.html")).toBe("html");
    expect(getSourceLanguage("web/legacy.HTM")).toBe("html");
  });

  it("routes the JSP page, document, fragment, and tag-file family to the JSP extractor", () => {
    expect(getSourceLanguage("web/index.jsp")).toBe("jsp");
    expect(getSourceLanguage("web/layout.JSPF")).toBe("jsp");
    expect(getSourceLanguage("web/document.jspx")).toBe("jsp");
    expect(getSourceLanguage("WEB-INF/tags/card.tag")).toBe("jsp");
    expect(getSourceLanguage("WEB-INF/tags/card.tagx")).toBe("jsp");
  });

  it("routes CSS files to the CSS extractor", () => {
    expect(getSourceLanguage("web/site.css")).toBe("css");
    expect(getSourceLanguage("web/PRINT.CSS")).toBe("css");
  });

  it("routes every supported JavaScript module extension to the JavaScript extractor", () => {
    expect(getSourceLanguage("src/index.js")).toBe("javascript");
    expect(getSourceLanguage("src/index.mjs")).toBe("javascript");
    expect(getSourceLanguage("src/index.jsx")).toBe("javascript");
    expect(getSourceLanguage("src/index.cjs")).toBe("javascript");
    expect(getSourceLanguage("src/INDEX.CJS")).toBe("javascript");
  });

  it("bounds full source reads for large repositories", async () => {
    const projectPath = resolve("bounded-source-project");
    const sourcePaths = Array.from(
      { length: MAXIMUM_SOURCE_CONCURRENT_READS * 4 },
      (_, index) => join(projectPath, `Source${index}.java`)
    );
    let activeReads = 0;
    let observedPeakReads = 0;

    const files = await loadSourcePaths(projectPath, sourcePaths, async () => {
      activeReads += 1;
      observedPeakReads = Math.max(observedPeakReads, activeReads);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1));
      activeReads -= 1;
      return "class Example {}\n";
    });

    expect(files).toHaveLength(sourcePaths.length);
    expect(observedPeakReads).toBeLessThanOrEqual(MAXIMUM_SOURCE_CONCURRENT_READS);
  });

  it("aggregates unreadable source files before failing the scan", async () => {
    const projectPath = await createProject();
    await writeFile(join(projectPath, "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(join(projectPath, "b.ts"), "export const b = 2;\n", "utf8");
    const reader: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readFile(filePath) {
        if (filePath.endsWith("a.ts")) {
          throw Object.assign(new Error("denied"), { code: "EACCES", path: filePath });
        }
        if (filePath.endsWith("b.ts")) {
          throw Object.assign(new Error("denied"), { code: "EPERM", path: filePath });
        }
        return nativeProjectFilesystemReader.readFile(filePath);
      }
    };

    await expect(discoverSourceFiles(projectPath, { filesystemReader: reader })).rejects.toMatchObject({
      code: "PROJECT_PATH_UNREADABLE",
      evidence: [
        { path: "a.ts", code: "EACCES" },
        { path: "b.ts", code: "EPERM" }
      ],
      total: 2
    });
    await expect(discoverSourceFileFingerprints(projectPath, { filesystemReader: reader }))
      .rejects.toMatchObject({ code: "PROJECT_PATH_UNREADABLE", total: 2 });
  });

  it("streams the same UTF-8 SHA-256 identity as a complete decoded read", async () => {
    const projectPath = await createProject();
    const sourcePath = join(projectPath, "large.ts");
    await writeFile(sourcePath, `export const text = "${"繁體中文🙂".repeat(200_000)}";\n`, "utf8");

    const expected = hashSource(await readFile(sourcePath, "utf8"));

    await expect(hashUtf8File(sourcePath)).resolves.toBe(expected);
  });

  it("preserves Node UTF-8 replacement semantics across stream boundaries", async () => {
    const projectPath = await createProject();
    const sourcePath = join(projectPath, "invalid.ts");
    await writeFile(sourcePath, Buffer.concat([
      Buffer.alloc(65_535, 0x61),
      Buffer.from([0xf0, 0x9f]),
      Buffer.from([0x61, 0x0a])
    ]));

    await expect(hashUtf8File(sourcePath)).resolves.toBe(
      hashSource(await readFile(sourcePath, "utf8"))
    );
  });

  it("discovers scoped sources and project-wide configuration candidates in one walk", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "src"), { recursive: true });
    await mkdir(join(projectPath, "outside"), { recursive: true });
    await mkdir(join(projectPath, "node_modules", "hidden"), { recursive: true });
    await writeFile(join(projectPath, ".gitignore"), "src/ignored.ts\n", "utf8");
    await writeFile(join(projectPath, "src", "entry.ts"), "export const entry = true;\n", "utf8");
    await writeFile(join(projectPath, "src", "ignored.ts"), "export const ignored = true;\n", "utf8");
    await writeFile(join(projectPath, "outside", "other.ts"), "export const other = true;\n", "utf8");
    await writeFile(join(projectPath, "outside", "package.json"), "{}\n", "utf8");
    await writeFile(join(projectPath, "node_modules", "hidden", "package.json"), "{}\n", "utf8");

    const result = await discoverFreshnessProjectPaths(projectPath, {
      scopeRoots: ["src"],
      isConfigurationCandidateFileName: (name) => name === "package.json"
    });

    expect(result.policy).toBe("single-project-walk-v3");
    expect(result.sourcePaths.map((path) => path.replaceAll("\\", "/"))).toEqual([
      expect.stringMatching(/\/src\/entry\.ts$/u)
    ]);
    expect(result.configurationPaths).toEqual([".gitignore", "outside/package.json"]);
  });

  it("verifies full source hashes without retaining source text", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "src"), { recursive: true });
    await writeFile(join(projectPath, "src", "entry.ts"), "export const answer = 42;\n", "utf8");
    await writeFile(join(projectPath, "src", "bridge.h"), "@interface Bridge : NSObject\n@end\n", "utf8");

    const fingerprints = await discoverSourceFileFingerprints(projectPath);

    expect(fingerprints).toEqual([
      {
        relativePath: "src/bridge.h",
        language: "objc",
        contentHash: hashSource("@interface Bridge : NSObject\n@end\n")
      },
      {
        relativePath: "src/entry.ts",
        language: "typescript",
        contentHash: hashSource("export const answer = 42;\n")
      }
    ]);
    expect(fingerprints[0]).not.toHaveProperty("sourceText");
    expect(fingerprints[0]).not.toHaveProperty("absolutePath");
  });

  it("discovers supported source files in deterministic relative-path order", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "src"), { recursive: true });
    await mkdir(join(projectPath, "conf"), { recursive: true });
    await mkdir(join(projectPath, "node_modules", "ignored"), { recursive: true });
    await writeFile(join(projectPath, "src", "z.ts"), "export const z = 1;", "utf8");
    await writeFile(join(projectPath, "src", "a.js"), "export const a = 1;", "utf8");
    await writeFile(join(projectPath, "src", "b.py"), "def b():\n    return 1\n", "utf8");
    await writeFile(join(projectPath, "src", "c.go"), "package main\n", "utf8");
    await writeFile(join(projectPath, "src", "d.rs"), "fn main() {}\n", "utf8");
    await writeFile(join(projectPath, "src", "e.java"), "class Example {}\n", "utf8");
    await writeFile(join(projectPath, "src", "f.php"), "<?php\nfunction example() {}\n", "utf8");
    await writeFile(join(projectPath, "src", "g.c"), "int main(void) { return 0; }\n", "utf8");
    await writeFile(join(projectPath, "src", "g.clj"), "(ns sample.core)\n", "utf8");
    await writeFile(join(projectPath, "src", "g.cpp"), "int main() { return 0; }\n", "utf8");
    await writeFile(join(projectPath, "src", "g.erl"), "-module(example).\n", "utf8");
    await writeFile(join(projectPath, "src", "g.ex"), "defmodule Example do\nend\n", "utf8");
    await writeFile(join(projectPath, "src", "g.exs"), "IO.puts(\"example\")\n", "utf8");
    await writeFile(join(projectPath, "src", "g.hs"), "main = putStrLn \"example\"\n", "utf8");
    await writeFile(join(projectPath, "src", "g.jl"), "health() = \"ok\"\n", "utf8");
    await writeFile(join(projectPath, "src", "g.lua"), "local answer = 42\n", "utf8");
    await writeFile(join(projectPath, "src", "g.luau"), "--!strict\nlocal answer: number = 42\n", "utf8");
    await writeFile(join(projectPath, "src", "g.m"), "@implementation Answer\n@end\n", "utf8");
    await writeFile(join(projectPath, "src", "g.mjs"), "export const answer = 42;\n", "utf8");
    await writeFile(join(projectPath, "src", "g.mm"), "@implementation Answer\n@end\n", "utf8");
    await writeFile(join(projectPath, "src", "g.h"), "@interface Answer : NSObject\n@end\n", "utf8");
    await writeFile(join(projectPath, "src", "g.ml"), "let answer = 42\n", "utf8");
    await writeFile(join(projectPath, "src", "g.fs"), "let answer = 42\n", "utf8");
    await writeFile(join(projectPath, "src", "g.nim"), "proc answer() = discard\n", "utf8");
    await writeFile(join(projectPath, "src", "g.pas"), "procedure Answer; begin end;\n", "utf8");
    await writeFile(join(projectPath, "src", "g.pl"), "use Dancer2;\n", "utf8");
    await writeFile(join(projectPath, "src", "g.pm"), "package Sample;\n", "utf8");
    await writeFile(join(projectPath, "src", "g.zig"), "pub fn main() void {}\n", "utf8");
    await writeFile(join(projectPath, "src", "g.R"), "answer <- 42\n", "utf8");
    await writeFile(join(projectPath, "src", "g.bash"), "deploy() { :; }\n", "utf8");
    await writeFile(join(projectPath, "src", "h.hpp"), "class Header {};\n", "utf8");
    await writeFile(join(projectPath, "src", "i.cs"), "public class Api {}\n", "utf8");
    await writeFile(join(projectPath, "src", "j.rb"), "class Api\nend\n", "utf8");
    await writeFile(join(projectPath, "src", "k.kt"), "class Api {}\n", "utf8");
    await writeFile(join(projectPath, "src", "l.swift"), "struct Api {}\n", "utf8");
    await writeFile(join(projectPath, "src", "m.dart"), "class Api {}\n", "utf8");
    await writeFile(join(projectPath, "src", "n.scala"), "object Api {}\n", "utf8");
    await writeFile(join(projectPath, "src", "o.vue"), "<template><main /></template>\n", "utf8");
    await writeFile(join(projectPath, "src", "p.svelte"), "<main />\n", "utf8");
    await writeFile(join(projectPath, "src", "q.astro"), "<main />\n", "utf8");
    await writeFile(join(projectPath, "src", "r.razor"), "<main />\n", "utf8");
    await writeFile(join(projectPath, "src", "r.cshtml"), "@page \"/\"\n", "utf8");
    await writeFile(join(projectPath, "src", "r.jsp"), "<main />\n", "utf8");
    await writeFile(join(projectPath, "src", "s.ets"), "@Component struct App {}\n", "utf8");
    await writeFile(join(projectPath, "src", "s.sh"), "deploy() { :; }\n", "utf8");
    await writeFile(join(projectPath, "src", "t.tf"), "resource \"aws_s3_bucket\" \"assets\" {}\n", "utf8");
    await writeFile(join(projectPath, "src", "u.blade.php"), "@extends('layouts.app')\n", "utf8");
    await writeFile(join(projectPath, "src", "u.liquid"), "{% render 'card' %}\n", "utf8");
    await writeFile(join(projectPath, "src", "u.twig"), "{% extends \"base.html.twig\" %}\n", "utf8");
    await writeFile(join(projectPath, "src", "v.sol"), "contract Ledger {}\n", "utf8");
    await writeFile(join(projectPath, "src", "w.cfc"), "component {}\n", "utf8");
    await writeFile(join(projectPath, "src", "x.cfm"), "<cfoutput>ok</cfoutput>\n", "utf8");
    await writeFile(join(projectPath, "src", "y.cfs"), "function ok() {}\n", "utf8");
    await writeFile(join(projectPath, "src", "y.nix"), "{ answer = 42; }\n", "utf8");
    await writeFile(join(projectPath, "src", "y.vb"), "Public Class Answer\nEnd Class\n", "utf8");
    await writeFile(join(projectPath, "conf", "routes"), "GET /health controllers.HealthController.health\n", "utf8");
    await writeFile(join(projectPath, "conf", "admin.routes"), "GET /admin controllers.AdminController.index\n", "utf8");
    await writeFile(join(projectPath, "README.md"), "ignored", "utf8");
    await writeFile(join(projectPath, "node_modules", "ignored", "index.js"), "ignored", "utf8");

    const files = await discoverSourceFiles(projectPath);

    expect(files.map((file) => file.relativePath)).toEqual([
      "conf/admin.routes",
      "conf/routes",
      "src/a.js",
      "src/b.py",
      "src/c.go",
      "src/d.rs",
      "src/e.java",
      "src/f.php",
      "src/g.R",
      "src/g.bash",
      "src/g.c",
      "src/g.clj",
      "src/g.cpp",
      "src/g.erl",
      "src/g.ex",
      "src/g.exs",
      "src/g.fs",
      "src/g.h",
      "src/g.hs",
      "src/g.jl",
      "src/g.lua",
      "src/g.luau",
      "src/g.m",
      "src/g.mjs",
      "src/g.ml",
      "src/g.mm",
      "src/g.nim",
      "src/g.pas",
      "src/g.pl",
      "src/g.pm",
      "src/g.zig",
      "src/h.hpp",
      "src/i.cs",
      "src/j.rb",
      "src/k.kt",
      "src/l.swift",
      "src/m.dart",
      "src/n.scala",
      "src/o.vue",
      "src/p.svelte",
      "src/q.astro",
      "src/r.cshtml",
      "src/r.jsp",
      "src/r.razor",
      "src/s.ets",
      "src/s.sh",
      "src/t.tf",
      "src/u.blade.php",
      "src/u.liquid",
      "src/u.twig",
      "src/v.sol",
      "src/w.cfc",
      "src/x.cfm",
      "src/y.cfs",
      "src/y.nix",
      "src/y.vb",
      "src/z.ts"
    ]);
    expect(files.map((file) => file.language)).toEqual([
      "scala",
      "scala",
      "javascript",
      "python",
      "go",
      "rust",
      "java",
      "php",
      "r",
      "shell",
      "c",
      "clojure",
      "cpp",
      "erlang",
      "elixir",
      "elixir",
      "fsharp",
      "objc",
      "haskell",
      "julia",
      "lua",
      "luau",
      "objc",
      "javascript",
      "ocaml",
      "objc",
      "nim",
      "pascal",
      "perl",
      "perl",
      "zig",
      "cpp",
      "csharp",
      "ruby",
      "kotlin",
      "swift",
      "dart",
      "scala",
      "vue",
      "svelte",
      "astro",
      "razor",
      "jsp",
      "razor",
      "arkts",
      "shell",
      "terraform",
      "blade",
      "liquid",
      "twig",
      "solidity",
      "cfml",
      "cfml",
      "cfml",
      "nix",
      "vbnet",
      "typescript"
    ]);
  });

  it("recognizes COBOL implementation and copybook extensions", () => {
    expect(getSourceLanguage("src/billing.cbl")).toBe("cobol");
    expect(getSourceLanguage("src/billing.cob")).toBe("cobol");
    expect(getSourceLanguage("src/billing.cobol")).toBe("cobol");
    expect(getSourceLanguage("copybooks/customer.cpy")).toBe("cobol");
  });

  it("recognizes the Zig source extension", () => {
    expect(getSourceLanguage("src/main.zig")).toBe("zig");
  });

  it("recognizes YAML source extensions", () => {
    expect(getSourceLanguage("config/application.yaml")).toBe("yaml");
    expect(getSourceLanguage("config/application.yml")).toBe("yaml");
  });

  it("recognizes the XML source extension", () => {
    expect(getSourceLanguage("config/catalog.xml")).toBe("xml");
  });

  it("recognizes the Java properties source extension", () => {
    expect(getSourceLanguage("config/application.properties")).toBe("properties");
    expect(getSourceLanguage("resources/logging.PROPERTIES")).toBe("properties");
  });

  it("recognizes Shell and Bash source extensions", () => {
    expect(getSourceLanguage("scripts/deploy.sh")).toBe("shell");
    expect(getSourceLanguage("scripts/release.BASH")).toBe("shell");
  });

  it("recognizes the SQL source extension", () => {
    expect(getSourceLanguage("db/schema.sql")).toBe("sql");
    expect(getSourceLanguage("migrations/001_init.SQL")).toBe("sql");
  });

  it("recognizes GraphQL source extensions", () => {
    expect(getSourceLanguage("api/schema.graphql")).toBe("graphql");
    expect(getSourceLanguage("api/query.GQL")).toBe("graphql");
    expect(getSourceLanguage("api/schema.graphqls")).toBe("graphql");
  });

  it("recognizes the Protocol Buffers source extension", () => {
    expect(getSourceLanguage("api/catalog.proto")).toBe("proto");
    expect(getSourceLanguage("api/CATALOG.PROTO")).toBe("proto");
  });

  it("recognizes the Groovy source extension", () => {
    expect(getSourceLanguage("src/catalog.groovy")).toBe("groovy");
    expect(getSourceLanguage("src/CATALOG.GROOVY")).toBe("groovy");
  });

  it("recognizes fixed- and free-form Fortran source extensions", () => {
    expect(getSourceLanguage("src/solver.f")).toBe("fortran");
    expect(getSourceLanguage("src/solver.for")).toBe("fortran");
    expect(getSourceLanguage("src/solver.f90")).toBe("fortran");
    expect(getSourceLanguage("src/SOLVER.F08")).toBe("fortran");
  });

  it("recognizes Ada source extensions", () => {
    expect(getSourceLanguage("src/directory.ads")).toBe("ada");
    expect(getSourceLanguage("src/main.adb")).toBe("ada");
    expect(getSourceLanguage("src/legacy.ADA")).toBe("ada");
  });

  it("discovers only source-proven Objective-C .h headers", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "Headers"), { recursive: true });
    const header = [
      "#import <Foundation/Foundation.h>",
      "@interface HealthController : NSObject",
      "- (void)check;",
      "@end"
    ].join("\n");
    await writeFile(join(projectPath, "Headers", "HealthController.h"), header, "utf8");
    await writeFile(
      join(projectPath, "Headers", "HealthChecking.h"),
      ["@protocol HealthChecking", "- (BOOL)isHealthy;", "@end"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(projectPath, "Headers", "PlainC.h"),
      "typedef struct { int status; } HealthStatus;\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Headers", "Commented.h"),
      "// @interface Fake : NSObject\n// @end\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Headers", "Quoted.h"),
      "const char *marker = \"@interface Fake\\n@end\";\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Headers", "Macro.h"),
      "#define FAKE \\\r\n@interface Fake : NSObject\r\n@end\r\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Headers", "Incomplete.h"),
      "@interface Incomplete : NSObject\n",
      "utf8"
    );
    await writeFile(
      join(projectPath, "Headers", "Conditional.h"),
      ["#if 0", "@interface Dead : NSObject", "@end", "#endif"].join("\n"),
      "utf8"
    );
    for (const [name, prefix] of [
      ["CommentConditional.h", "/**/ "],
      ["FormFeedConditional.h", "\f"],
      ["VerticalTabConditional.h", "\v"]
    ] as const) {
      await writeFile(
        join(projectPath, "Headers", name),
        [
          `${prefix}#if 0`,
          "@interface Dead : NSObject",
          "@end",
          "#endif",
          `@interface ${name.replace(".h", "")} : NSObject`,
          "@end"
        ].join("\n"),
        "utf8"
      );
    }
    await writeFile(
      join(projectPath, "Headers", "InertDirectiveText.h"),
      [
        'const char *marker = "#if 0";',
        "// #if 0",
        "@interface InertDirectiveText : NSObject",
        "@end"
      ].join("\n"),
      "utf8"
    );

    expect(getSourceLanguage("Headers/HealthController.h")).toBeNull();
    expect(getSourceLanguage("Headers/HealthController.h", header)).toBe("objc");

    const files = await discoverSourceFiles(projectPath);

    expect(files.map((file) => [file.relativePath, file.language])).toEqual([
      ["Headers/CommentConditional.h", "objc"],
      ["Headers/FormFeedConditional.h", "objc"],
      ["Headers/HealthChecking.h", "objc"],
      ["Headers/HealthController.h", "objc"],
      ["Headers/InertDirectiveText.h", "objc"],
      ["Headers/VerticalTabConditional.h", "objc"]
    ]);
  });

  it("applies root and nested gitignore files with case-sensitive anchored, glob, and negation rules", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "ignored"), { recursive: true });
    await mkdir(join(projectPath, "src", "generated"), { recursive: true });
    await mkdir(join(projectPath, "nested"), { recursive: true });
    await writeFile(
      join(projectPath, ".gitignore"),
      [
        "/root-only.ts",
        "**/generated/*.ts",
        "ignored/",
        "!ignored/",
        "ignored/*",
        "!ignored/keep.ts",
        "case.ts"
      ].join("\n"),
      "utf8"
    );
    await writeFile(join(projectPath, "root-only.ts"), "export const rootOnly = true;", "utf8");
    await writeFile(join(projectPath, "Case.ts"), "export const upper = true;", "utf8");
    await writeFile(join(projectPath, "ignored", "drop.ts"), "export const drop = true;", "utf8");
    await writeFile(join(projectPath, "ignored", "keep.ts"), "export const keep = true;", "utf8");
    await writeFile(join(projectPath, "src", "generated", "drop.ts"), "export const generated = true;", "utf8");
    await writeFile(join(projectPath, "src", "generated", "keep.js"), "export const generatedJs = true;", "utf8");
    await writeFile(join(projectPath, "nested", ".gitignore"), "nested-hidden.ts\n", "utf8");
    await writeFile(join(projectPath, "nested", "nested-hidden.ts"), "export const nested = true;", "utf8");

    const files = await discoverSourceFiles(projectPath);

    expect(files.map((file) => file.relativePath)).toEqual([
      "Case.ts",
      "ignored/keep.ts",
      "src/generated/keep.js"
    ]);
  });

  it("never traverses hard-excluded directories, even when gitignore negates them", async () => {
    const projectPath = await createProject();
    const hardExcludedDirectories = [".git", ".SymbolLattice", "coverage", "dist", "node_modules"];

    await writeFile(
      join(projectPath, ".gitignore"),
      hardExcludedDirectories.map((directory) => `!${directory}/`).join("\n"),
      "utf8"
    );
    await writeFile(join(projectPath, "included.ts"), "export const included = true;", "utf8");

    for (const directory of hardExcludedDirectories) {
      await mkdir(join(projectPath, directory), { recursive: true });
      await writeFile(join(projectPath, directory, "should-not-index.ts"), "export const ignored = true;", "utf8");
    }

    const files = await discoverSourceFiles(projectPath);

    expect(files.map((file) => file.relativePath)).toEqual(["included.ts"]);
  });

  it("canonicalizes scope roots, folds overlap, and limits discovery to the selected directories", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "src", "lib"), { recursive: true });
    await mkdir(join(projectPath, "tools"), { recursive: true });
    await writeFile(join(projectPath, "src", "index.ts"), "export const source = true;", "utf8");
    await writeFile(join(projectPath, "src", "lib", "nested.ts"), "export const nested = true;", "utf8");
    await writeFile(join(projectPath, "tools", "tool.ts"), "export const tool = true;", "utf8");
    await writeFile(join(projectPath, "outside.ts"), "export const outside = true;", "utf8");

    await expect(
      canonicalizeScopeRoots(projectPath, ["tools", "src/lib", "src", "src"])
    ).resolves.toEqual(["src", "tools"]);

    const firstPass = await discoverSourceFiles(projectPath, {
      scopeRoots: ["tools", "src/lib", "src", "src"]
    });
    const secondPass = await discoverSourceFiles(projectPath, {
      scopeRoots: ["src", "tools"]
    });

    expect(firstPass.map((file) => file.relativePath)).toEqual([
      "src/index.ts",
      "src/lib/nested.ts",
      "tools/tool.ts"
    ]);
    expect(secondPass.map((file) => file.relativePath)).toEqual(
      firstPass.map((file) => file.relativePath)
    );
  });

  it("rejects scope roots outside the project or that are not directories", async () => {
    const projectPath = await createProject();
    await writeFile(join(projectPath, "file.ts"), "export const file = true;", "utf8");

    await expect(canonicalizeScopeRoots(projectPath, ["../outside"])).rejects.toThrow(
      "outside the project"
    );
    await expect(canonicalizeScopeRoots(projectPath, ["file.ts"])).rejects.toThrow(
      "not a directory"
    );
  });

  it("normalizes safe project-relative paths and rejects external paths", async () => {
    const projectPath = await createProject();

    expect(toProjectRelativePath(projectPath, join(projectPath, "src", "index.ts"))).toBe(
      "src/index.ts"
    );
    expect(() => toProjectRelativePath(projectPath, resolve(projectPath, "..", "other.ts"))).toThrow(
      "outside the project"
    );
  });

  it("uses deterministic content hashes and identifies unsafe roots", () => {
    expect(hashSource("same source")).toBe(hashSource("same source"));
    expect(hashSource("one")).not.toBe(hashSource("two"));
    expect(isUnsafeProjectPath(parse(resolve(tmpdir())).root)).toBe(true);
  });
});
