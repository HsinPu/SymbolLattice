/** Changes whenever a path rule changes the persisted source-role verdict. */
export const SOURCE_ROLE_CLASSIFIER_VERSION = "source-role-evidence-v2";

export type SourceRole = "production" | "test" | "icon" | "localization";

export interface SourceRoleEvidence {
  readonly kind: "path";
  readonly ruleId: string;
}

/** Immutable, generation-bound source-role classification for one indexed file. */
export interface SourceRoleClassification {
  readonly classifierVersion: string;
  readonly role: SourceRole;
  readonly evidence: readonly SourceRoleEvidence[];
}

interface PathRule {
  readonly ruleId: string;
  readonly pattern: RegExp;
}

const TEST_PATH_RULES: readonly PathRule[] = [
  {
    ruleId: "source-role.path.test-directory",
    pattern: /(?:^|\/)(?:__tests__|tests?|specs?|e2e)(?:\/|$)/iu
  },
  {
    ruleId: "source-role.path.javascript-test-suffix",
    pattern: /\.(?:test|spec|e2e)\.[cm]?[jt]sx?$/iu
  },
  { ruleId: "source-role.path.go-test-suffix", pattern: /_test\.go$/iu },
  { ruleId: "source-role.path.python-test-prefix", pattern: /(?:^|\/)test_[^/]+\.pyi?$/iu },
  { ruleId: "source-role.path.python-test-suffix", pattern: /_test\.pyi?$/iu },
  { ruleId: "source-role.path.ruby-test-suffix", pattern: /_test\.rb$/iu },
  { ruleId: "source-role.path.ruby-spec-suffix", pattern: /_spec\.rb$/iu },
  { ruleId: "source-role.path.dart-test-suffix", pattern: /_test\.dart$/iu },
  { ruleId: "source-role.path.rust-test-suffix", pattern: /_test\.rs$/iu },
  {
    ruleId: "source-role.path.jvm-test-class",
    pattern: /(?:Test|Tests|Spec)\.(?:java|kt|kts|scala)$/u
  },
  { ruleId: "source-role.path.dotnet-test-class", pattern: /(?:Test|Tests|Spec)\.cs$/u },
  { ruleId: "source-role.path.swift-test-class", pattern: /Tests\.swift$/u }
];

const AUXILIARY_PATH_RULES: readonly (PathRule & {
  readonly role: Exclude<SourceRole, "production" | "test">;
})[] = [
  {
    role: "icon",
    ruleId: "source-role.path.icon-token",
    pattern: /(?:^|[/._-])icons?(?=$|[/._-])/iu
  },
  {
    role: "localization",
    ruleId: "source-role.path.i18n-token",
    pattern: /(?:^|[/._-])i18n(?=$|[/._-])/iu
  }
];

/** Precision-first path classification; it never excludes the file from the graph. */
export function classifySourceRole(filePath: string): SourceRoleClassification {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const testRule = TEST_PATH_RULES.find((candidate) => candidate.pattern.test(normalizedPath));
  const auxiliaryRule = testRule === undefined
    ? AUXILIARY_PATH_RULES.find((candidate) => candidate.pattern.test(normalizedPath))
    : undefined;
  return {
    classifierVersion: SOURCE_ROLE_CLASSIFIER_VERSION,
    role: testRule !== undefined
      ? "test"
      : auxiliaryRule?.role ?? "production",
    evidence: testRule !== undefined
      ? [{ kind: "path", ruleId: testRule.ruleId }]
      : auxiliaryRule === undefined
        ? []
        : [{ kind: "path", ruleId: auxiliaryRule.ruleId }]
  };
}

/** Backwards-compatible read for snapshots created before source-role evidence existed. */
export function sourceRoleClassificationFor(
  value: { readonly sourceRole?: SourceRoleClassification }
): SourceRoleClassification {
  return value.sourceRole ?? {
    classifierVersion: "unclassified-legacy-snapshot",
    role: "production",
    evidence: []
  };
}
