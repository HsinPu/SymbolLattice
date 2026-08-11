import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";

const temporaryProjectPaths: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-go-module-"));
  temporaryProjectPaths.push(projectPath);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );

  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjectPaths.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true }))
  );
});

describe("root Go module package resolution", () => {
  it("resolves one exact internal import to a deterministic non-test package file", async () => {
    const projectPath = await createProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "cmd/server/main.go": "package main\n",
      "api/request/list.go": "package request\n",
      "api/request/list_test.go": "package request_test\n"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(
      scan.moduleResolver.resolve("cmd/server/main.go", "example.test/warehouse/api/request")
    ).toEqual({
      targetFilePath: "api/request/list.go",
      strategy: "go-module-package",
      configurationPaths: ["go.mod"]
    });
    expect(
      scan.moduleResolver.resolve("cmd/server/main.go", "example.test/elsewhere/api/request")
    ).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["go.mod"]
    });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "go-module", path: "go.mod", state: "present" })
      ])
    );
  });

  it.each([
    ["an inline replace directive", "replace example.test/warehouse/api/request => ../request\n"],
    [
      "a replace block",
      "replace (\n  example.test/warehouse/api/request => ../request\n)\n"
    ],
    ["a malformed replace directive", "replace\n"],
    [
      "duplicate replace directives",
      "replace example.test/warehouse/api/request => ../request\n" +
        "replace example.test/warehouse/api/other => ../other\n"
    ]
  ])("fails closed for %s", async (_description, replaceDirective) => {
    const projectPath = await createProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n\n" + replaceDirective,
      "cmd/server/main.go": "package main\n",
      "api/request/list.go": "package request\n"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(
      scan.moduleResolver.resolve("cmd/server/main.go", "example.test/warehouse/api/request")
    ).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["go.mod"]
    });
  });

  it("does not mistake commented replace text for a replace directive", async () => {
    const projectPath = await createProject({
      "go.mod":
        "// replace example.test/warehouse/api/request => ../request\n" +
        "module example.test/warehouse // replace is only documentation\n\n" +
        "go 1.22\n",
      "cmd/server/main.go": "package main\n",
      "api/request/list.go": "package request\n"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(
      scan.moduleResolver.resolve("cmd/server/main.go", "example.test/warehouse/api/request")
    ).toEqual({
      targetFilePath: "api/request/list.go",
      strategy: "go-module-package",
      configurationPaths: ["go.mod"]
    });
  });

  it.each(["_ignored.go", ".ignored.go"])(
    "does not select %s as a root-module package representative",
    async (ignoredFileName) => {
      const projectPath = await createProject({
        "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
        "cmd/server/main.go": "package main\n",
        [`api/request/${ignoredFileName}`]: "package request\n",
        "api/request/list.go": "package request\n"
      });
      const scan = await new FileSystemSourceCatalog().scan(projectPath);

      expect(
        scan.moduleResolver.resolve("cmd/server/main.go", "example.test/warehouse/api/request")
      ).toEqual({
        targetFilePath: "api/request/list.go",
        strategy: "go-module-package",
        configurationPaths: ["go.mod"]
      });
    }
  );

  it("does not guess a module import when the root go.mod is absent", async () => {
    const projectPath = await createProject({
      "cmd/server/main.go": "package main\n",
      "api/request/list.go": "package request\n"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(
      scan.moduleResolver.resolve("cmd/server/main.go", "example.test/warehouse/api/request")
    ).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: []
    });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "go-module", path: "go.mod", state: "absent" })
      ])
    );
  });

  it("does not cross a nested go.mod boundary from the root module", async () => {
    const projectPath = await createProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "cmd/server/main.go": "package main\n",
      "api/request/go.mod": "module example.test/warehouse/api/request\n\ngo 1.22\n",
      "api/request/list.go": "package request\n"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(
      scan.moduleResolver.resolve("cmd/server/main.go", "example.test/warehouse/api/request")
    ).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["go.mod", "api/request/go.mod"]
    });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "go-module", path: "api/request/go.mod", state: "present" })
      ])
    );
  });

  it("does not treat a nested module importer as part of the root module", async () => {
    const projectPath = await createProject({
      "go.mod": "module example.test/warehouse\n\ngo 1.22\n",
      "api/request/list.go": "package request\n",
      "apps/worker/go.mod": "module example.test/warehouse/apps/worker\n\ngo 1.22\n",
      "apps/worker/cmd/main.go": "package main\n"
    });
    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(
      scan.moduleResolver.resolve(
        "apps/worker/cmd/main.go",
        "example.test/warehouse/api/request"
      )
    ).toEqual({
      targetFilePath: null,
      strategy: "unresolved",
      configurationPaths: ["go.mod", "apps/worker/go.mod"]
    });
  });
});
