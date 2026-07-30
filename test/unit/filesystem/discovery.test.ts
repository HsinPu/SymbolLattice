import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalizeScopeRoots,
  discoverSourceFiles,
  hashSource,
  isUnsafeProjectPath,
  toProjectRelativePath
} from "../../../src/infrastructure/filesystem/discovery.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-"));
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
    await writeFile(join(projectPath, "src", "g.ml"), "let answer = 42\n", "utf8");
    await writeFile(join(projectPath, "src", "g.fs"), "let answer = 42\n", "utf8");
    await writeFile(join(projectPath, "src", "g.nim"), "proc answer() = discard\n", "utf8");
    await writeFile(join(projectPath, "src", "g.pl"), "use Dancer2;\n", "utf8");
    await writeFile(join(projectPath, "src", "g.pm"), "package Sample;\n", "utf8");
    await writeFile(join(projectPath, "src", "g.R"), "answer <- 42\n", "utf8");
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
    await writeFile(join(projectPath, "src", "s.ets"), "@Component struct App {}\n", "utf8");
    await writeFile(join(projectPath, "src", "t.tf"), "resource \"aws_s3_bucket\" \"assets\" {}\n", "utf8");
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
      "src/g.c",
      "src/g.clj",
      "src/g.cpp",
      "src/g.erl",
      "src/g.ex",
      "src/g.exs",
      "src/g.fs",
      "src/g.hs",
      "src/g.jl",
      "src/g.lua",
      "src/g.ml",
      "src/g.nim",
      "src/g.pl",
      "src/g.pm",
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
      "src/r.razor",
      "src/s.ets",
      "src/t.tf",
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
      "c",
      "clojure",
      "cpp",
      "erlang",
      "elixir",
      "elixir",
      "fsharp",
      "haskell",
      "julia",
      "lua",
      "ocaml",
      "nim",
      "perl",
      "perl",
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
      "arkts",
      "terraform",
      "typescript"
    ]);
  });

  it("applies only the root gitignore with case-sensitive anchored, glob, and negation rules", async () => {
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
      "nested/nested-hidden.ts",
      "src/generated/keep.js"
    ]);
  });

  it("never traverses hard-excluded directories, even when gitignore negates them", async () => {
    const projectPath = await createProject();
    const hardExcludedDirectories = [".git", ".symbol-lattice", "coverage", "dist", "node_modules"];

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
