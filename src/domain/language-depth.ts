import { ARTIFACT_LANGUAGES, type ArtifactLanguage } from "./types.js";

export const LANGUAGE_DEPTH_EVIDENCE_TIERS = [
  "external-tier-a",
  "external-partial",
  "bounded-relation",
  "large-project-structural",
  "targeted"
] as const;

export type LanguageDepthEvidenceTier = (typeof LANGUAGE_DEPTH_EVIDENCE_TIERS)[number];
/** Highest independently retained relation scope; it is not a full-language support claim. */
export type LanguageRelationDepth = "project" | "same-file" | "framework" | "structural";
export type LanguageTruthKind =
  | "typescript-compiler-api"
  | "javac-oracle"
  | "groovy-compiler-ast"
  | "source-occurrence-oracle"
  | "large-project-structural"
  | "targeted-tests";

export interface LanguageDepthEvidence {
  readonly language: ArtifactLanguage;
  readonly discoveryExpected: true;
  readonly fileIdentityExpected: true;
  readonly declarationEvidence: "targeted-tests";
  readonly evidenceTier: LanguageDepthEvidenceTier;
  readonly relationDepth: LanguageRelationDepth;
  readonly truthKind: LanguageTruthKind;
  readonly evidenceVersion: string | null;
  readonly largeProjectValidated: boolean;
  readonly relationReleaseValidated: boolean;
  readonly knownLimitations: readonly string[];
}

const BOUNDED_RELATION_LANGUAGES = new Set<ArtifactLanguage>([
  "go", "rust", "kotlin", "swift", "dart", "csharp", "fsharp", "ocaml", "haskell",
  "scala", "elixir", "erlang", "clojure", "nix", "nim", "zig", "cpp", "c", "php",
  "objc", "ruby", "sql", "r", "markdown", "proto", "graphql", "groovy"
]);

const LARGE_PROJECT_STRUCTURAL_LANGUAGES = new Set<ArtifactLanguage>([
  "javascript", "python", "html", "css", "jsp", "shell", "lua", "luau", "julia", "perl"
]);

const PROJECT_RELATION_LANGUAGES = new Set<ArtifactLanguage>([
  "typescript", "javascript", "arkts", "vue", "svelte", "astro", "razor", "python", "go",
  "rust", "java", "ada", "php", "blade", "objc", "elixir", "erlang", "clojure", "haskell",
  "ocaml", "fsharp", "nim", "cpp", "csharp", "ruby", "kotlin", "swift", "dart", "scala",
  "terraform", "liquid", "twig", "nix", "c", "zig", "sql", "graphql", "proto", "markdown",
  "jsp", "xml"
]);

const SAME_FILE_RELATION_LANGUAGES = new Set<ArtifactLanguage>([
  "groovy", "fortran", "luau", "pascal", "r", "julia", "solidity", "cfml", "vbnet"
]);

const FRAMEWORK_RELATION_LANGUAGES = new Set<ArtifactLanguage>([
  "perl", "cobol", "yaml", "properties"
]);

const STRUCTURAL_RELATION_LANGUAGES = new Set<ArtifactLanguage>([
  "lua", "html", "css", "shell"
]);

const LARGE_PROJECT_VALIDATED_LANGUAGES = new Set<ArtifactLanguage>([
  "typescript", "javascript", "python", "java", "lua", "luau", "objc", "r", "elixir", "perl",
  "julia", "ruby", "html", "jsp", "css", "shell", "markdown", "groovy"
]);

const EVIDENCE_VERSION: Readonly<Partial<Record<ArtifactLanguage, string>>> = Object.freeze({
  typescript: "0.456.0",
  javascript: "0.427.0",
  python: "0.429.0",
  go: "0.457.0",
  rust: "0.458.0",
  java: "0.494.0",
  groovy: "0.497.0",
  lua: "0.433.0",
  luau: "0.434.0",
  objc: "0.476.0",
  r: "0.481.0",
  elixir: "0.467.0",
  erlang: "0.468.0",
  clojure: "0.469.0",
  perl: "0.447.0",
  julia: "0.435.0",
  haskell: "0.465.0",
  ocaml: "0.464.0",
  fsharp: "0.463.0",
  nim: "0.471.0",
  cpp: "0.473.0",
  csharp: "0.462.0",
  ruby: "0.477.0",
  kotlin: "0.459.0",
  swift: "0.460.0",
  dart: "0.461.0",
  scala: "0.466.0",
  nix: "0.470.0",
  c: "0.474.0",
  zig: "0.472.0",
  sql: "0.478.0",
  graphql: "0.484.0",
  proto: "0.483.0",
  markdown: "0.482.0",
  html: "0.425.0",
  jsp: "0.428.0",
  css: "0.426.0",
  shell: "0.485.0"
});

const LANGUAGE_LIMITATIONS: Readonly<Partial<Record<ArtifactLanguage, readonly string[]>>> =
  Object.freeze({
    typescript: ["parse-rejected, overload, conditional export, and runtime dispatch remain nonclaims"],
    java: ["external classpath, compiler-only inference, and wider inherited dispatch remain nonclaims"],
    groovy: ["only compiler-confirmed unique top-level def self-recursion is exact; dynamic dispatch, closures, delegates, metaclass, and class methods remain nonclaims"],
    shell: ["function body calls require parser response ABI v2"],
    lua: ["product indexing retains parser-proven function structure without general call edges"],
    html: ["HTML relations are structural resources and containment, not runtime navigation"],
    css: ["CSS relations are structural selectors and containment"],
    sql: ["views, routines, search path, and dynamic SQL remain nonclaims"],
    graphql: ["runtime resolvers, stitching, federation, and multiple implements remain nonclaims"],
    proto: ["qualified, generated, plugin, and runtime RPC semantics remain nonclaims"],
    markdown: ["MDX execution, generated routing, anchors, and unsafe destinations remain nonclaims"]
  });

function evidenceTier(language: ArtifactLanguage): LanguageDepthEvidenceTier {
  if (language === "typescript") return "external-tier-a";
  if (language === "java") return "external-partial";
  if (BOUNDED_RELATION_LANGUAGES.has(language)) return "bounded-relation";
  if (LARGE_PROJECT_STRUCTURAL_LANGUAGES.has(language)) return "large-project-structural";
  return "targeted";
}

function relationDepth(language: ArtifactLanguage): LanguageRelationDepth {
  const matches = [
    PROJECT_RELATION_LANGUAGES.has(language),
    SAME_FILE_RELATION_LANGUAGES.has(language),
    FRAMEWORK_RELATION_LANGUAGES.has(language),
    STRUCTURAL_RELATION_LANGUAGES.has(language)
  ].filter(Boolean).length;
  if (matches !== 1) {
    throw new Error(`Language depth relation classification must be unique: ${language}`);
  }
  if (PROJECT_RELATION_LANGUAGES.has(language)) return "project";
  if (SAME_FILE_RELATION_LANGUAGES.has(language)) return "same-file";
  if (FRAMEWORK_RELATION_LANGUAGES.has(language)) return "framework";
  return "structural";
}

function truthKind(language: ArtifactLanguage): LanguageTruthKind {
  if (language === "typescript") return "typescript-compiler-api";
  if (language === "java") return "javac-oracle";
  if (language === "groovy") return "groovy-compiler-ast";
  if (BOUNDED_RELATION_LANGUAGES.has(language)) return "source-occurrence-oracle";
  if (LARGE_PROJECT_STRUCTURAL_LANGUAGES.has(language)) return "large-project-structural";
  return "targeted-tests";
}

export const LANGUAGE_DEPTH_MATRIX: readonly LanguageDepthEvidence[] = Object.freeze(
  ARTIFACT_LANGUAGES.map((language) => Object.freeze({
    language,
    discoveryExpected: true as const,
    fileIdentityExpected: true as const,
    declarationEvidence: "targeted-tests" as const,
    evidenceTier: evidenceTier(language),
    relationDepth: relationDepth(language),
    truthKind: truthKind(language),
    evidenceVersion: EVIDENCE_VERSION[language] ?? null,
    largeProjectValidated: LARGE_PROJECT_VALIDATED_LANGUAGES.has(language),
    relationReleaseValidated:
      language === "typescript" || language === "java" || BOUNDED_RELATION_LANGUAGES.has(language),
    knownLimitations: LANGUAGE_LIMITATIONS[language] ?? (
      evidenceTier(language) === "targeted"
        ? ["no standardized 300-positive/150-negative relation release"]
        : ["verified evidence covers a bounded static subset, not full runtime semantics"]
    )
  }))
);

export function summarizeLanguageDepthMatrix(
  matrix: readonly LanguageDepthEvidence[]
): {
  readonly languages: number;
  readonly tiers: Readonly<Record<LanguageDepthEvidenceTier, number>>;
  readonly relationDepth: Readonly<Record<LanguageRelationDepth, number>>;
  readonly largeProjectValidated: number;
  readonly relationReleaseValidated: number;
} {
  const tiers: Record<LanguageDepthEvidenceTier, number> = {
    "external-tier-a": 0,
    "external-partial": 0,
    "bounded-relation": 0,
    "large-project-structural": 0,
    targeted: 0
  };
  const depths: Record<LanguageRelationDepth, number> = {
    project: 0,
    "same-file": 0,
    framework: 0,
    structural: 0
  };
  for (const entry of matrix) {
    tiers[entry.evidenceTier] += 1;
    depths[entry.relationDepth] += 1;
  }
  return {
    languages: matrix.length,
    tiers,
    relationDepth: depths,
    largeProjectValidated: matrix.filter(({ largeProjectValidated }) => largeProjectValidated).length,
    relationReleaseValidated:
      matrix.filter(({ relationReleaseValidated }) => relationReleaseValidated).length
  };
}
