import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflowPath = resolve(process.cwd(), ".github", "workflows", "release.yml");
const workflowText = readFileSync(workflowPath, "utf8");
const workflow = parse(workflowText) as {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, { steps?: Array<{ uses?: string; run?: string }> }>;
};

describe("GitHub release workflow", () => {
  it("runs only for pushed version tags", () => {
    expect(workflow.on).toEqual({
      push: {
        tags: ["v*"]
      }
    });
    expect(workflowText).not.toContain("pull_request:");
    expect(workflowText).not.toContain("workflow_dispatch:");
  });

  it("grants only the permissions needed to publish and attest artifacts", () => {
    expect(workflow.permissions).toEqual({
      contents: "write",
      "id-token": "write",
      attestations: "write"
    });
  });

  it("pins every third-party action to an immutable commit", () => {
    const uses = workflow.jobs?.release?.steps?.flatMap((step) => step.uses ?? []) ?? [];
    expect(uses).toEqual([
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
      "actions/attest-build-provenance@78e6cbd37d0ac1a40113c04f2037dacf1ea3f12e"
    ]);
    for (const reference of uses) {
      expect(reference).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("verifies the tag, release contract, clean install, and published release", () => {
    const commands = workflow.jobs?.release?.steps?.flatMap((step) => step.run ?? []).join("\n") ?? "";
    expect(commands).toContain('git fetch --force --no-tags origin "refs/tags/$GITHUB_REF_NAME:refs/tags/$GITHUB_REF_NAME"');
    expect(commands).toContain('git cat-file -t "$GITHUB_REF_NAME"');
    expect(commands).toContain("npm run release:contract");
    expect(commands).toContain("npm install --prefix");
    expect(commands).toContain("symbol-lattice --version");
    expect(commands).toContain("gh release create");
    expect(workflowText).toContain("subject-path: release/*");
  });
});
