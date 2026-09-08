import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import * as installer from "../../scripts/install/github-source-install.mjs";

const path = resolve(".github/workflows/ci.yml");
function loadWorkflow() {
  expect(existsSync(path), "PR/main CI must exist").toBe(true);
  return parse(readFileSync(path, "utf8"));
}

describe("daily CI contract", () => {
  it("checks main and PRs without publishing or granting write permissions", () => {
    const workflow = loadWorkflow();
    expect(workflow.on).toEqual({ push: { branches: ["main"] }, pull_request: { branches: ["main"] } });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
    const serialized = JSON.stringify(workflow);
    for (const forbidden of ["pull_request_target", "npm publish", "gh release", "id-token", "secrets."]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("uses both supported Node majors on Windows/Linux and runs real gates", () => {
    const job = loadWorkflow().jobs.verify;
    expect(job.strategy.matrix).toEqual({ os: ["ubuntu-latest", "windows-latest"], node: [22, 24] });
    expect(job.strategy["fail-fast"]).toBe(false);
    expect(job["timeout-minutes"]).toBeGreaterThan(0);
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(45);
    for (const step of job.steps.filter(step => step.uses)) expect(step.uses).toMatch(/@[a-f0-9]{40}$/u);
    expect(job.steps.find(step => step.uses?.startsWith("actions/checkout@"))?.with["persist-credentials"]).toBe(false);
    const commands = job.steps.flatMap(step => step.run ?? []).join("\n");
    for (const command of ["npm ci", "npm run check", "npm run build", "npm test", "npm run verify:language-depth", "npm run verify:mcp-worker-generation", "nonempty-depth-lifecycle.mjs", "verify-local-pack.mjs", "--concurrency 4", "--concurrency 16"]) {
      expect(commands).toContain(command);
    }
    expect(commands.indexOf("npm run build")).toBeLessThan(commands.indexOf("npm test"));
    expect(commands).not.toContain("--ignore-scripts");
    expect(job.steps.some(step => step.uses?.startsWith("actions/upload-artifact@") && step.if === "always()")).toBe(true);
  });
});

describe("shared npm pack output parser", () => {
  it("accepts a final array after noisy LF/CRLF prepack output", () => {
    const manifest = [{ name: "@hsinpu/symbollattice", version: "0.514.0", filename: "package.tgz" }];
    for (const newline of ["\n", "\r\n"]) {
      const output = ['> prepack', '{"passed":true}', '["earlier diagnostic"]', JSON.stringify(manifest, null, 2)].join(newline);
      expect(installer.parseFinalJsonArray(output)).toEqual(manifest);
      expect(() => JSON.parse(output)).toThrow();
    }
  });

  it("rejects malformed, nonarray, and trailing diagnostic output", () => {
    for (const output of ["", "{}", "[{", '[]\nnot-json', '{"nested": [1]}']) {
      expect(() => installer.parseFinalJsonArray(output)).toThrow();
    }
  });
});
