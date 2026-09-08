import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

const files: Record<string, string> = {
  "api/requests.go": 'package api\nimport g "github.com/gogf/gf/v2/frame/g"\ntype ListReq struct {\n  g.Meta `path:"/users" method:"GET"`\n}\n',
  "api/controller.go": 'package api\nimport "context"\ntype Controller struct{}\nfunc NewController() *Controller { return &Controller{} }\nfunc (c *Controller) List(ctx context.Context, req *ListReq) {}\n',
  "api/register.go": 'package api\nimport g "github.com/gogf/gf/v2/frame/g"\nfunc Register() { g.Server().Group("/v1").Bind(NewController()) }\n'
};
function snapshot(admitted: Record<string, string>) {
  const sourceDocuments = Object.entries(admitted).map(([relativePath, sourceText]) => ({ relativePath,
    absolutePath: `/goframe-parity/${relativePath}`, language: "go" as const, sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex") }));
  return resolveProjectFacts({ sourceDocuments, extractedFiles: sourceDocuments.map((file) => extractFileFacts({
    filePath: file.relativePath, language: file.language, sourceText: file.sourceText })), indexedAt: "2026-09-09T00:00:00.000Z" });
}
describe("GoFrame complete-output parity before move", () => {
  it("preserves same-package cross-file factory-bound exact routes", () => {
    const result = snapshot(files);
    const routes = result.edges.filter((edge) => edge.kind === "routes" && edge.resolution === "exact");
    expect(routes.length).toBeGreaterThan(0);
    expect(result.symbols.some((symbol) => symbol.kind === "route" && symbol.name.includes("/v1/users"))).toBe(true);
    expect(result).toMatchSnapshot();
  });
  it("preserves unbound request/controller heuristic without exact routes", () => {
    const result = snapshot(Object.fromEntries(Object.entries(files).filter(([path]) => path !== "api/register.go")));
    const routes = result.edges.filter((edge) => edge.kind === "routes");
    expect(routes.some((edge) => edge.resolution === "heuristic")).toBe(true);
    expect(routes.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
  it("preserves missing request metadata nonclaim", () => {
    const result = snapshot(Object.fromEntries(Object.entries(files).filter(([path]) => path !== "api/requests.go")));
    expect(result.edges.filter((edge) => edge.kind === "routes")).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
