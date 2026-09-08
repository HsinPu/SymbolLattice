import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";

type ReactNativeFixtureFiles = Readonly<Record<string, { readonly language: SourceDocument["language"]; readonly source: string }>>;

const POSITIVE_FILES: ReactNativeFixtureFiles = {
  "src/native-bridge.ts": {
    language: "typescript",
    source: [
      'import { NativeModules } from "react-native";',
      "export function nativeSchedule() {",
      "  NativeModules.CalendarModule.createEvent();",
      "}"
    ].join("\n")
  },
  "src/turbo-contract.ts": {
    language: "typescript",
    source: [
      'import { TurboModuleRegistry } from "react-native";',
      'import type { TurboModule } from "react-native";',
      "export interface CalendarSpec extends TurboModule {",
      "  createEvent(): void;",
      "}",
      'const Calendar = TurboModuleRegistry.getEnforcing<CalendarSpec>("CalendarModule");',
      "export function turboSchedule() {",
      "  Calendar.createEvent();",
      "}",
      "export default Calendar;"
    ].join("\n")
  },
  "src/use-calendar.ts": {
    language: "typescript",
    source: [
      'import Calendar from "./turbo-contract";',
      "export function importedSchedule() { Calendar.createEvent(); }"
    ].join("\n")
  },
  "src/calendar-barrel.ts": {
    language: "typescript",
    source: 'export { default } from "./turbo-contract";'
  },
  "src/calendar-api.ts": {
    language: "typescript",
    source: [
      'import Calendar from "./calendar-barrel";',
      "export default Calendar;"
    ].join("\n")
  },
  "src/use-calendar-reexport.ts": {
    language: "typescript",
    source: [
      'import Calendar from "./calendar-api";',
      "export function reexportSchedule() { Calendar.createEvent(); }"
    ].join("\n")
  },
  "android/CalendarModule.java": {
    language: "java",
    source: [
      "import com.facebook.react.bridge.ReactContextBaseJavaModule;",
      "import com.facebook.react.bridge.ReactMethod;",
      "public class CalendarModule extends ReactContextBaseJavaModule {",
      '  public String getName() { return "CalendarModule"; }',
      "  @ReactMethod public void createEvent() {}",
      "}"
    ].join("\n")
  },
  "ios/CalendarModule.m": {
    language: "objc",
    source: [
      "#import <React/RCTBridgeModule.h>",
      "@implementation CalendarModule",
      "RCT_EXPORT_MODULE(CalendarModule)",
      "RCT_EXPORT_METHOD(createEvent)",
      "@end"
    ].join("\n")
  },
  "ios/CalendarBridgeExport.m": {
    language: "objc",
    source: [
      "#import <React/RCTBridgeModule.h>",
      "@interface RCT_EXTERN_MODULE(CalendarBridge, NSObject)",
      "RCT_EXTERN_METHOD(createEvent:(NSString *)name)",
      "@end"
    ].join("\n")
  },
  "ios/CalendarBridge.swift": {
    language: "swift",
    source: [
      "import Foundation",
      "@objc(CalendarBridge)",
      "final class CalendarBridge: NSObject {}",
      "extension CalendarBridge {",
      "  @objc(createEvent:)",
      "  func writeEvent(name: String) {}",
      "}"
    ].join("\n")
  }
};

const CONSUMER_ONLY_FILES: ReactNativeFixtureFiles = {
  "src/native-bridge.ts": {
    language: "typescript",
    source: [
      'import { NativeModules } from "react-native";',
      "export function nativeSchedule() { NativeModules.MissingModule.missing(); }"
    ].join("\n")
  },
  "src/turbo-contract.ts": {
    language: "typescript",
    source: [
      'import { TurboModuleRegistry } from "react-native";',
      'import type { TurboModule } from "react-native";',
      "export interface MissingSpec extends TurboModule { missing(): void; }",
      'const Missing = TurboModuleRegistry.getEnforcing<MissingSpec>("MissingModule");',
      "export function turboSchedule() { Missing.missing(); }",
      "export default Missing;"
    ].join("\n")
  },
  "src/use-calendar.ts": {
    language: "typescript",
    source: [
      'import Missing from "./turbo-contract";',
      "export function importedSchedule() { Missing.missing(); }"
    ].join("\n")
  },
  "src/calendar-barrel.ts": {
    language: "typescript",
    source: 'export { default } from "./turbo-contract";'
  },
  "src/calendar-api.ts": {
    language: "typescript",
    source: [
      'import Missing from "./calendar-barrel";',
      "export default Missing;"
    ].join("\n")
  },
  "src/use-calendar-reexport.ts": {
    language: "typescript",
    source: [
      'import Missing from "./calendar-api";',
      "export function reexportSchedule() { Missing.missing(); }"
    ].join("\n")
  },
  "ios/MissingBridgeExport.m": {
    language: "objc",
    source: [
      "#import <React/RCTBridgeModule.h>",
      "@interface RCT_EXTERN_MODULE(MissingBridge, NSObject)",
      "RCT_EXTERN_METHOD(missing:(NSString *)name)",
      "@end"
    ].join("\n")
  }
};

function resolveFixture(files: ReactNativeFixtureFiles) {
  const sourceDocuments = Object.entries(files).map(([relativePath, file]) => ({
    relativePath,
    absolutePath: `/react-native-resolver-parity/${relativePath}`,
    language: file.language,
    sourceText: file.source,
    contentHash: createHash("sha256").update(file.source).digest("hex")
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) =>
      extractFileFacts({
        filePath: document.relativePath,
        sourceText: document.sourceText,
        language: document.language
      })
    ),
    indexedAt: INDEXED_AT
  });
}

function frameworkEdges(result: ReturnType<typeof resolveFixture>) {
  return result.edges.filter((edge) =>
    edge.evidence?.ruleId.startsWith("framework.react-native.") === true &&
    (edge.kind === "calls" || edge.kind === "references")
  );
}

describe("React Native bridge resolver pre-move parity golden", () => {
  it("preserves all six bridge projectors and their exact evidence", () => {
    const result = resolveFixture(POSITIVE_FILES);
    const exactEdges = frameworkEdges(result).filter((edge) => edge.resolution === "exact");
    const ruleIds = exactEdges.map((edge) => edge.evidence?.ruleId ?? "");

    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.react-native.native-modules.direct-module-and-method."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.react-native.swift-extern.direct-objc-class-and-selector."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.react-native.turbo-modules.direct-registry."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.react-native.turbo-modules.spec-contract."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.react-native.turbo-modules.default-import."))).toBe(true);
    expect(ruleIds.some((ruleId) => ruleId.startsWith("framework.react-native.turbo-modules.default-re-export."))).toBe(true);
    expect(exactEdges.every((edge) => edge.targetId !== null && edge.confidence === 1)).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("keeps missing bridge implementations unresolved without exact targets", () => {
    const result = resolveFixture(CONSUMER_ONLY_FILES);
    const edges = frameworkEdges(result);

    expect(edges.length).toBeGreaterThan(0);
    expect(edges.filter((edge) => edge.resolution === "exact")).toEqual([]);
    expect(edges.filter((edge) => edge.targetId !== null)).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
