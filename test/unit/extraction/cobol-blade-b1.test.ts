import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SymbolLatticeService } from "../../../src/application/index.js";
import { extractBladeFileFacts } from "../../../src/extraction/blade.js";
import { extractCobolFileFacts } from "../../../src/extraction/cobol.js";
import type { ArtifactFacts, SymbolNode } from "../../../src/domain/index.js";
import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";
import { SqliteGraphStore } from "../../../src/infrastructure/sqlite/index.js";

const temporaryDirectories: string[] = [];

function symbolByName(facts: ArtifactFacts, name: string): SymbolNode {
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

async function createBladeProject(
  files: ReadonlyMap<string, string> = new Map([
    ["resources/views/pages/home.blade.php", "@extends('layouts.app')\n"],
    ["resources/views/layouts/app.blade.php", "<main>{{ $slot }}</main>\n"]
  ])
): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-cobol-blade-b1-"));
  temporaryDirectories.push(projectPath);
  for (const [relativePath, sourceText] of files) {
    const filePath = resolve(projectPath, ...relativePath.split("/"));
    await mkdir(resolve(filePath, ".."), { recursive: true });
    await writeFile(filePath, sourceText, "utf8");
  }
  return projectPath;
}

function createService(): SymbolLatticeService {
  return new SymbolLatticeService(new SqliteGraphStore(), new FileSystemSourceCatalog());
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("COBOL and Blade B1 exact relations", () => {
  it("emits an exact same-program COBOL paragraph PERFORM with complete evidence", () => {
    const facts = extractCobolFileFacts({
      filePath: "src/dispatch.cbl",
      language: "cobol",
      sourceText: [
        "       IDENTIFICATION DIVISION.",
        "       PROGRAM-ID. DISPATCH.",
        "       PROCEDURE DIVISION.",
        "       MAIN-LOGIC.",
        "           PERFORM SEND-REPORT.",
        "       SEND-REPORT.",
        "           GOBACK.",
        "       END PROGRAM DISPATCH."
      ].join("\n")
    });
    const caller = symbolByName(facts, "MAIN-LOGIC");
    const callee = symbolByName(facts, "SEND-REPORT");

    expect(calls(facts)).toEqual([
      expect.objectContaining({
        sourceId: caller.id,
        targetId: callee.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "SEND-REPORT",
        evidence: {
          ruleId: "syntax.cobol.same-program.unique-paragraph-perform",
          stage: "syntax",
          candidateSymbolIds: [callee.id]
        }
      })
    ]);
  });

  it("fails closed for COBOL forms that can change a paragraph PERFORM target or scope", () => {
    const sources = [
      ["dynamic identifier", "           PERFORM WS-TARGET."],
      ["THRU", "           PERFORM SEND-REPORT THRU CLEANUP."],
      ["ALTER", "           ALTER SEND-REPORT TO PROCEED TO CLEANUP.\n           PERFORM SEND-REPORT."],
      ["GO TO", "           GO TO SEND-REPORT.\n           PERFORM SEND-REPORT."],
      ["COPY", "           COPY WORK-PROCEDURES.\n           PERFORM SEND-REPORT."],
      ["REPLACE", "           REPLACE ==SEND-REPORT== BY ==CLEANUP==.\n           PERFORM SEND-REPORT."],
      ["section collision", "       SEND-REPORT SECTION.\n           PERFORM SEND-REPORT."],
      ["duplicate paragraph", "       SEND-REPORT.\n           GOBACK.\n       SEND-REPORT.\n           GOBACK.\n       MAIN-LOGIC.\n           PERFORM SEND-REPORT."]
    ] as const;

    for (const [description, body] of sources) {
      const facts = extractCobolFileFacts({
        filePath: "src/invalid.cbl",
        language: "cobol",
        sourceText: [
          "       IDENTIFICATION DIVISION.",
          "       PROGRAM-ID. INVALID.",
          "       PROCEDURE DIVISION.",
          "       MAIN-LOGIC.",
          body,
          "       SEND-REPORT.",
          "           GOBACK.",
          "       CLEANUP.",
          "           GOBACK.",
          "       END PROGRAM INVALID."
        ].join("\n")
      });
      expect(calls(facts), description).toEqual([]);
    }
  });

  it("does not assign an un-named procedure PERFORM across section or END DECLARATIVES boundaries", () => {
    const sources = [
      [
        "section boundary",
        [
          "       MAIN-LOGIC.",
          "           DISPLAY 'before section'.",
          "       WORK SECTION.",
          "           PERFORM SEND-REPORT.",
          "       SEND-REPORT.",
          "           GOBACK."
        ]
      ],
      [
        "END DECLARATIVES boundary",
        [
          "       ERROR-LOGIC.",
          "           DISPLAY 'before end'.",
          "       END DECLARATIVES.",
          "           PERFORM SEND-REPORT.",
          "       SEND-REPORT.",
          "           GOBACK."
        ]
      ],
      [
        "free-format section boundary",
        [
          "       MAIN-LOGIC.",
          "           DISPLAY 'before section'.",
          "    WORK SECTION.",
          "           PERFORM SEND-REPORT.",
          "       SEND-REPORT.",
          "           GOBACK."
        ]
      ],
      [
        "free-format END DECLARATIVES boundary",
        [
          "       ERROR-LOGIC.",
          "           DISPLAY 'before end'.",
          "    END DECLARATIVES.",
          "           PERFORM SEND-REPORT.",
          "       SEND-REPORT.",
          "           GOBACK."
        ]
      ]
    ] as const;

    for (const [description, procedure] of sources) {
      const facts = extractCobolFileFacts({
        filePath: "src/boundary.cbl",
        language: "cobol",
        sourceText: [
          "       IDENTIFICATION DIVISION.",
          "       PROGRAM-ID. BOUNDARY.",
          "       PROCEDURE DIVISION.",
          ...procedure,
          "       END PROGRAM BOUNDARY."
        ].join("\n")
      });

      expect(calls(facts), description).toEqual([]);
    }
  });

  it("keeps Blade literal template references exact only after one project-local target is proven", async () => {
    const facts = extractBladeFileFacts({
      filePath: "resources/views/pages/home.blade.php",
      language: "blade",
      sourceText: "@extends('layouts.app')"
    });
    const projectPath = await createBladeProject();
    await createService().init({ projectPath });

    const result = await createService().callees(
      projectPath,
      "resources/views/pages/home.blade.php"
    );
    expect(result.relations).toHaveLength(1);
    const relation = result.relations[0];
    if (relation === undefined) {
      throw new Error("Missing resolved Blade template relation.");
    }
    expect(relation).toMatchObject({
      symbol: { filePath: "resources/views/layouts/app.blade.php" },
      edge: {
        kind: "calls",
        resolution: "exact",
        confidence: 1,
        referenceName: "extends resources/views/layouts/app.blade.php",
        evidence: {
          ruleId: "framework.laravel-blade.extends.literal-resources-views.exact-target",
          stage: "module",
          candidateSymbolIds: [relation.symbol.id]
        }
      }
    });
    expect(facts.bladeFacts?.templateReferences).toHaveLength(1);
  });

  it("keeps otherwise literal Blade targets unresolved when project files leave the conventional root unproven", async () => {
    const baseFiles = new Map([
      ["resources/views/pages/home.blade.php", "@extends('layouts.app')\n"],
      ["resources/views/layouts/app.blade.php", "<main>{{ $slot }}</main>\n"]
    ]);
    const scenarios = [
      ["custom path PHP", "app/ViewServiceProvider.php", "View::addLocation(base_path('themes/views'));\n"],
      ["view config", "config/view.php", "<?php return ['paths' => [resource_path('views')]];\n"],
      ["application PHP", "app/Http/Controller.php", "<?php final class Controller {}\n"],
      ["provider", "app/Providers/AppServiceProvider.php", "<?php final class AppServiceProvider {}\n"],
      ["other view root", "themes/views/layouts/app.blade.php", "<main>theme</main>\n"],
      ["duplicate logical target", "resources/views/layouts/app.php", "<?php echo 'fallback';\n"]
    ] as const;

    for (const [description, extraPath, extraSource] of scenarios) {
      const projectPath = await createBladeProject(new Map([...baseFiles, [extraPath, extraSource]]));
      const store = new SqliteGraphStore();
      await new SymbolLatticeService(store, new FileSystemSourceCatalog()).init({ projectPath });
      const edge = store.getSnapshot(projectPath).edges.find(
        (candidate) =>
          candidate.filePath === "resources/views/pages/home.blade.php" &&
          candidate.referenceName === "extends resources/views/layouts/app.blade.php"
      );

      expect(edge, description).toMatchObject({
        targetId: null,
        resolution: "unresolved",
        confidence: 0,
        evidence: {
          ruleId: "framework.laravel-blade.extends.literal-resources-views.unproven-project-root",
          stage: "module",
          candidateSymbolIds: []
        }
      });
    }
  });

  it("rejects Blade dynamic, namespaced, and unsupported component directive forms", () => {
    const facts = extractBladeFileFacts({
      filePath: "resources/views/pages/invalid.blade.php",
      language: "blade",
      sourceText: [
        "@include($view)",
        "@include('partials.' . $card)",
        "@includeIf('partials.card')",
        "@include('vendor::card')",
        "@stack('scripts')",
        "<x-alert />",
        "<x-dynamic-component :component=\"$component\" />",
        "@component($component)",
        "@extends('layouts.app')"
      ].join("\n")
    });

    expect(facts.bladeFacts?.templateReferences).toEqual([
      expect.objectContaining({
        kind: "extends",
        targetFilePath: "resources/views/layouts/app.blade.php"
      })
    ]);
  });
});
