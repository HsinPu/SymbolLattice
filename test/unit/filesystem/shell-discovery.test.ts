import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  discoverFreshnessProjectPaths,
  discoverSourceFileFingerprints,
  discoverSourceFiles,
  getSourceLanguage,
  MAXIMUM_SHELL_SHEBANG_READ_BYTES
} from "../../../src/infrastructure/filesystem/discovery.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-discovery-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("Shell exact-shebang discovery", () => {
  const allowlist = [
    "#!/bin/sh",
    "#!/usr/bin/sh",
    "#!/bin/dash",
    "#!/usr/bin/dash",
    "#!/bin/bash",
    "#!/usr/bin/bash",
    "#!/usr/bin/env sh",
    "#!/usr/bin/env dash",
    "#!/usr/bin/env bash"
  ] as const;

  it("discovers all nine exact allowlisted first lines with LF, one CRLF line, and one exact EOF line", async () => {
    const projectPath = await createProject();
    for (const [index, shebang] of allowlist.entries()) {
      await writeFile(
        join(projectPath, `tool-${String(index).padStart(2, "0")}.command`),
        `${shebang}\nf${index}() { :; }\n`,
        "utf8"
      );
    }
    await writeFile(join(projectPath, "crlf.tool"), "#!/usr/bin/env bash\r\ncrlf() { :; }\r\n", "utf8");
    await writeFile(join(projectPath, "eof.tool"), "#!/bin/sh", "utf8");

    const files = await discoverSourceFiles(projectPath);

    expect(files).toHaveLength(11);
    expect(files.every((file) => file.language === "shell")).toBe(true);
    expect(files.map((file) => file.relativePath)).toContain("eof.tool");
  });

  it("rejects BOM, whitespace, arguments, env -S, and spaced marker variants", async () => {
    const projectPath = await createProject();
    const rejected = [
      "#!/bin/sh ",
      "#!/bin/sh\t",
      "#!/bin/sh -eu",
      "#!/usr/bin/env bash -eu",
      "#!/usr/bin/env -S bash -eu",
      "#! /bin/sh",
      "\ufeff#!/bin/sh"
    ] as const;
    for (const [index, shebang] of rejected.entries()) {
      await writeFile(join(projectPath, `rejected-${index}.tool`), `${shebang}\nf() { :; }\n`, "utf8");
    }

    await expect(discoverSourceFiles(projectPath)).resolves.toEqual([]);
  });

  it("discovers the three v11 dotted-name misses without overriding classified extensions", async () => {
    const projectPath = await createProject();
    const dotted = [
      "test/installation_iojs/install version specified in .nvmrc from fake source",
      "test/slow/nvm run/Running 'nvm run 0.x' should error out sensibly when 0.x is not installed",
      "test/sourcing/Sourcing nvm.sh with --install and .nvmrc should install it"
    ] as const;
    for (const [index, relativePath] of dotted.entries()) {
      const absolutePath = join(projectPath, ...relativePath.split("/"));
      await mkdir(join(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, `#!/bin/sh\ndotted_${index}() { :; }\n`, "utf8");
    }
    await writeFile(join(projectPath, "classified.ts"), "#!/bin/sh\nexport const value = 1;\n", "utf8");

    const files = await discoverSourceFiles(projectPath);
    const fingerprints = await discoverSourceFileFingerprints(projectPath);
    const freshness = await discoverFreshnessProjectPaths(projectPath, {
      isConfigurationCandidateFileName: () => false
    });

    expect(files.map((file) => [file.relativePath, file.language])).toEqual([
      ["classified.ts", "typescript"],
      ...dotted.map((path) => [path, "shell"] as const)
    ]);
    expect(fingerprints.map((file) => [file.relativePath, file.language])).toEqual(
      files.map((file) => [file.relativePath, file.language])
    );
    expect(freshness.sourcePaths).toHaveLength(4);
  });

  it("checks ignore rules before any bounded shebang read", async () => {
    const projectPath = await createProject();
    await writeFile(join(projectPath, ".gitignore"), "ignored.tool\n", "utf8");
    await writeFile(join(projectPath, "ignored.tool"), "#!/bin/sh\nf() { :; }\n", "utf8");
    await writeFile(join(projectPath, "known.ts"), "export const known = true;\n", "utf8");
    const shellShebangReader = vi.fn(async () => new TextEncoder().encode("not-shell\n"));

    const files = await discoverSourceFiles(projectPath, { shellShebangReader });

    expect(files.map((file) => file.relativePath)).toEqual(["known.ts"]);
    expect(shellShebangReader).not.toHaveBeenCalledWith(
      join(projectPath, "ignored.tool"),
      MAXIMUM_SHELL_SHEBANG_READ_BYTES
    );
  });

  it("bounds the first-line read for otherwise-unclassified candidates", async () => {
    const projectPath = await createProject();
    const candidatePath = join(projectPath, "bounded.tool");
    await writeFile(candidatePath, "#!/usr/bin/env bash\nfunction bounded { :; }\n", "utf8");
    const shellShebangReader = vi.fn(async (_path: string, maximumBytes: number) => {
      expect(maximumBytes).toBe(MAXIMUM_SHELL_SHEBANG_READ_BYTES);
      return new TextEncoder().encode("#!/usr/bin/env bash\n");
    });

    const files = await discoverSourceFiles(projectPath, { shellShebangReader });

    expect(files.map((file) => [file.relativePath, file.language])).toEqual([
      ["bounded.tool", "shell"]
    ]);
    expect(shellShebangReader).toHaveBeenCalledExactlyOnceWith(
      candidatePath,
      MAXIMUM_SHELL_SHEBANG_READ_BYTES
    );
  });

  it("classifies source text only when an otherwise-unclassified path has an exact shebang", () => {
    expect(getSourceLanguage("scripts/release.tool")).toBeNull();
    expect(getSourceLanguage("scripts/release.tool", "#!/bin/bash\nfunction release { :; }\n"))
      .toBe("shell");
    expect(getSourceLanguage("scripts/release.tool", "#!/bin/bash\r\nfunction release { :; }\r\n"))
      .toBe("shell");
    expect(getSourceLanguage("scripts/release.tool", "#!/bin/bash -eu\nfunction release { :; }\n"))
      .toBeNull();
  });
});
