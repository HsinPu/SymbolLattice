import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

const files: Record<string, string> = {
  "src/main.ts": 'import Fastify from "fastify";\nimport { api } from "./barrel.js";\nconst app = Fastify();\napp.register(api, { prefix: "/api" });\n',
  "src/barrel.ts": 'export { api } from "./api.js";\n',
  "src/api.ts": 'import { listUsers } from "./handlers.js";\nimport { jobsPlugin } from "./jobs.js";\nexport async function api(server: unknown) { server.get("/users", listUsers); server.register(jobsPlugin, { prefix: "/v1" }); }\n',
  "src/jobs.ts": 'import { listUsers } from "./handlers.js";\nexport async function jobsPlugin(server: unknown) { server.get("/jobs", listUsers); }\n',
  "src/handlers.ts": 'export function listUsers() { return []; }\n'
};
function snapshot(admitted: Record<string, string>) {
  const sourceDocuments = Object.entries(admitted).map(([relativePath, sourceText]) => ({ relativePath,
    absolutePath: `/fastify-parity/${relativePath}`, language: "typescript" as const, sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex") }));
  return resolveProjectFacts({ sourceDocuments, extractedFiles: sourceDocuments.map((file) => extractFileFacts({
    filePath: file.relativePath, language: file.language, sourceText: file.sourceText })), indexedAt: "2026-09-09T00:00:00.000Z" });
}
describe("Fastify complete-output parity before move", () => {
  it("preserves re-exported plugin and nested registration routes", () => {
    const result = snapshot(files);
    expect(result.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name).sort()).toEqual(["GET /api/users", "GET /api/v1/jobs"]);
    expect(result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact")).toHaveLength(2);
    expect(result).toMatchSnapshot();
  });
  it("preserves missing plugin nonclaim", () => {
    const result = snapshot({"src/main.ts": files["src/main.ts"]!});
    expect(result.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
  it("bounds cyclic child registration without infinite synthetic paths", () => {
    const result = snapshot({ ...files, "src/jobs.ts": files["src/jobs.ts"]! +
      'import { api } from "./api.js";\nexport async function cycle(server: unknown) { server.register(api, { prefix: "/again" }); }\n',
      "src/api.ts": files["src/api.ts"]!.replace('server.register(jobsPlugin,', 'server.register(cycle,') + 'import { cycle } from "./jobs.js";\n' });
    expect(result.symbols.filter((symbol) => symbol.kind === "route").map((symbol) => symbol.name)).toEqual(["GET /api/users"]);
    expect(result).toMatchSnapshot();
  });
});
