import { describe, expect, it } from "vitest";

import {
  SOURCE_ROLE_CLASSIFIER_VERSION,
  classifySourceRole,
  sourceRoleClassificationFor
} from "../../../src/domain/index.js";

describe("source role classification", () => {
  it.each([
    ["test/unit/order-service.test.ts", "source-role.path.test-directory"],
    ["src/order-service.spec.ts", "source-role.path.javascript-test-suffix"],
    ["pkg/order_service_test.go", "source-role.path.go-test-suffix"],
    ["tests/test_orders.py", "source-role.path.test-directory"],
    ["lib/order_service_spec.rb", "source-role.path.ruby-spec-suffix"],
    ["test/order_service_test.dart", "source-role.path.test-directory"]
  ])("persists precision-first test evidence for %s", (filePath, ruleId) => {
    expect(classifySourceRole(filePath)).toEqual({
      classifierVersion: SOURCE_ROLE_CLASSIFIER_VERSION,
      role: "test",
      evidence: [{ kind: "path", ruleId }]
    });
  });

  it.each([
    "src/contest.ts",
    "src/specification.ts",
    "src/testing-utils.ts",
    "src/order-service.ts"
  ])("does not infer a test role from ambiguous production path %s", (filePath) => {
    expect(classifySourceRole(filePath)).toEqual({
      classifierVersion: SOURCE_ROLE_CLASSIFIER_VERSION,
      role: "production",
      evidence: []
    });
  });

  it("keeps legacy snapshots explicit instead of silently reclassifying live paths", () => {
    expect(sourceRoleClassificationFor({})).toEqual({
      classifierVersion: "unclassified-legacy-snapshot",
      role: "production",
      evidence: []
    });
  });
});
