import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";

const files: Record<string, string> = {
  "src/main.rs": 'mod routes;\nuse actix_web::{App, web};\nuse crate::routes::configure as routes_config;\nfn bootstrap() { let app = App::new().configure(routes_config).service(web::scope("/api").configure(routes_config)); }\n',
  "src/routes.rs": 'use actix_web::{get, web};\nasync fn health() {}\n#[get("/ready")]\nasync fn ready() {}\npub fn configure(cfg: &mut web::ServiceConfig) { cfg.route("/health", web::get().to(health)); cfg.service(ready); }\n'
};
function snapshot(admitted: Record<string, string>) {
  const sourceDocuments = Object.entries(admitted).map(([relativePath, sourceText]) => ({ relativePath,
    absolutePath: `/actix-parity/${relativePath}`, language: "rust" as const, sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex") }));
  return resolveProjectFacts({ sourceDocuments, extractedFiles: sourceDocuments.map((file) => extractFileFacts({
    filePath: file.relativePath, language: file.language, sourceText: file.sourceText })), indexedAt: "2026-09-09T00:00:00.000Z" });
}
describe("Actix complete-output parity before move", () => {
  it.each(["unique", "missing", "ambiguous"])("preserves %s direct-module mount evidence", (mode) => {
    const admitted = mode === "unique" ? files : mode === "missing" ? {"src/main.rs": files["src/main.rs"]!}
      : { ...files, "src/routes/mod.rs": files["src/routes.rs"]! };
    const result = snapshot(admitted);
    const routes = result.edges.filter((edge) => edge.kind === "routes" && edge.evidence?.ruleId.startsWith("framework.actix-web.imported-service-config."));
    if (mode === "unique") {
      expect(routes).toHaveLength(4);
      expect(routes.every((edge) => edge.resolution === "exact" && edge.confidence === 1)).toBe(true);
    } else {
      expect(routes).toEqual([]);
    }
    expect(result).toMatchSnapshot();
  });
});
