import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { ProjectConfigurationInput } from "../../domain/index-inputs.js";
import type { SourceDocument, XcodeTargetMembership } from "../../ports/source-catalog.js";
import {
  compareProjectPaths,
  HARD_EXCLUDED_DIRECTORY_NAMES,
  toProjectRelativePath
} from "./discovery.js";
import { readProjectConfigurationInput } from "./project-inputs.js";

type OpenStepValue = string | OpenStepDictionary | readonly OpenStepValue[];
type OpenStepDictionary = ReadonlyMap<string, OpenStepValue>;

interface PbxObject {
  readonly id: string;
  readonly isa: string;
  readonly values: OpenStepDictionary;
}

export interface XcodeProjectEvidence {
  readonly configurationInputs: readonly ProjectConfigurationInput[];
  readonly targetMemberships: readonly XcodeTargetMembership[];
}

/**
 * Minimal, strict reader for the ASCII/OpenStep plist form used by
 * `project.pbxproj`. It only exposes scalar values, dictionaries, and arrays;
 * an unsupported or malformed document deliberately produces no target facts.
 */
class OpenStepPropertyListParser {
  private position = 0;

  public constructor(private readonly sourceText: string) {}

  public parse(): OpenStepValue | null {
    const value = this.parseValue();
    if (value === null || !this.skipIgnored() || this.position !== this.sourceText.length) {
      return null;
    }
    return value;
  }

  private parseValue(): OpenStepValue | null {
    if (!this.skipIgnored()) {
      return null;
    }
    const character = this.sourceText[this.position];
    if (character === "{") {
      return this.parseDictionary();
    }
    if (character === "(") {
      return this.parseArray();
    }
    if (character === "\"") {
      return this.parseQuotedString();
    }
    return this.parseBareString();
  }

  private parseDictionary(): OpenStepDictionary | null {
    this.position += 1;
    const values = new Map<string, OpenStepValue>();
    if (!this.skipIgnored()) {
      return null;
    }
    if (this.sourceText[this.position] === "}") {
      this.position += 1;
      return values;
    }

    while (this.position < this.sourceText.length) {
      const key = this.parseString();
      if (key === null || !this.skipIgnored() || this.sourceText[this.position] !== "=") {
        return null;
      }
      this.position += 1;
      const value = this.parseValue();
      if (value === null || !this.skipIgnored() || this.sourceText[this.position] !== ";") {
        return null;
      }
      if (values.has(key)) {
        return null;
      }
      values.set(key, value);
      this.position += 1;
      if (!this.skipIgnored()) {
        return null;
      }
      if (this.sourceText[this.position] === "}") {
        this.position += 1;
        return values;
      }
    }

    return null;
  }

  private parseArray(): readonly OpenStepValue[] | null {
    this.position += 1;
    const values: OpenStepValue[] = [];
    if (!this.skipIgnored()) {
      return null;
    }
    if (this.sourceText[this.position] === ")") {
      this.position += 1;
      return values;
    }

    while (this.position < this.sourceText.length) {
      const value = this.parseValue();
      if (value === null || !this.skipIgnored() || this.sourceText[this.position] !== ",") {
        return null;
      }
      values.push(value);
      this.position += 1;
      if (!this.skipIgnored()) {
        return null;
      }
      if (this.sourceText[this.position] === ")") {
        this.position += 1;
        return values;
      }
    }

    return null;
  }

  private parseString(): string | null {
    if (!this.skipIgnored()) {
      return null;
    }
    return this.sourceText[this.position] === "\""
      ? this.parseQuotedString()
      : this.parseBareString();
  }

  private parseQuotedString(): string | null {
    if (this.sourceText[this.position] !== "\"") {
      return null;
    }
    this.position += 1;
    let value = "";
    while (this.position < this.sourceText.length) {
      const character = this.sourceText[this.position];
      if (character === "\"") {
        this.position += 1;
        return value;
      }
      if (character === "\\") {
        const escaped = this.sourceText[this.position + 1];
        if (escaped === undefined) {
          return null;
        }
        value += escaped;
        this.position += 2;
        continue;
      }
      value += character;
      this.position += 1;
    }
    return null;
  }

  private parseBareString(): string | null {
    const start = this.position;
    let embeddedDollarParentheses = 0;
    while (this.position < this.sourceText.length) {
      const character = this.sourceText[this.position];
      if (
        character === undefined ||
        /\s/u.test(character) ||
        character === "{" ||
        character === "}" ||
        character === "=" ||
        character === ";" ||
        character === "," ||
        (character === "/" &&
          (this.sourceText[this.position + 1] === "/" ||
            this.sourceText[this.position + 1] === "*"))
      ) {
        break;
      }
      if (character === "(") {
        if (this.sourceText.slice(start, this.position).startsWith("$")) {
          embeddedDollarParentheses += 1;
          this.position += 1;
          continue;
        }
        break;
      }
      if (character === ")") {
        if (embeddedDollarParentheses > 0) {
          embeddedDollarParentheses -= 1;
          this.position += 1;
          continue;
        }
        break;
      }
      this.position += 1;
    }
    return this.position === start ? null : this.sourceText.slice(start, this.position);
  }

  private skipIgnored(): boolean {
    while (this.position < this.sourceText.length) {
      const character = this.sourceText[this.position];
      if (character !== undefined && /\s/u.test(character)) {
        this.position += 1;
        continue;
      }
      if (this.sourceText.startsWith("/*", this.position)) {
        const end = this.sourceText.indexOf("*/", this.position + 2);
        if (end === -1) {
          return false;
        }
        this.position = end + 2;
        continue;
      }
      if (this.sourceText.startsWith("//", this.position)) {
        const end = this.sourceText.indexOf("\n", this.position + 2);
        this.position = end === -1 ? this.sourceText.length : end + 1;
        continue;
      }
      break;
    }
    return true;
  }
}

function isDictionary(value: OpenStepValue | null | undefined): value is OpenStepDictionary {
  return value instanceof Map;
}

function stringValue(value: OpenStepValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function stringArray(value: OpenStepValue | undefined): readonly string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }
  return value;
}

function parsePbxObjects(sourceText: string): {
  readonly root: OpenStepDictionary;
  readonly objects: ReadonlyMap<string, PbxObject>;
} | null {
  const root = new OpenStepPropertyListParser(sourceText).parse();
  if (!isDictionary(root)) {
    return null;
  }
  const objectDictionary = root.get("objects");
  if (!isDictionary(objectDictionary)) {
    return null;
  }
  const objects = new Map<string, PbxObject>();
  for (const [id, values] of objectDictionary) {
    if (!isDictionary(values)) {
      continue;
    }
    const isa = stringValue(values.get("isa"));
    if (isa === null) {
      continue;
    }
    objects.set(id, { id, isa, values });
  }
  return { root, objects };
}

function joinProjectRelativePath(basePath: string, childPath: string): string | null {
  const normalizedChildPath = childPath.replaceAll("\\", "/");
  if (
    normalizedChildPath.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalizedChildPath)
  ) {
    return null;
  }
  const parts = basePath === "" ? [] : basePath.split("/");
  for (const part of normalizedChildPath.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        return null;
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length === 0 ? null : parts.join("/");
}

function projectDirectoryFor(configurationPath: string): string | null {
  const parts = configurationPath.split("/");
  if (parts.length < 2 || parts.at(-1) !== "project.pbxproj") {
    return null;
  }
  const xcodeProjectDirectory = parts.slice(0, -1);
  if (!xcodeProjectDirectory.at(-1)?.endsWith(".xcodeproj")) {
    return null;
  }
  return xcodeProjectDirectory.slice(0, -1).join("/");
}

function resolvedContainerPath(
  object: PbxObject,
  parentPath: string,
  projectDirectory: string
): string | null {
  const sourceTree = stringValue(object.values.get("sourceTree"));
  const configuredPath = stringValue(object.values.get("path")) ?? "";
  if (sourceTree === "<group>") {
    return configuredPath === "" ? parentPath : joinProjectRelativePath(parentPath, configuredPath);
  }
  if (sourceTree === "SOURCE_ROOT") {
    return configuredPath === "" ? projectDirectory : joinProjectRelativePath(projectDirectory, configuredPath);
  }
  return null;
}

function resolvedFileReferencePath(
  object: PbxObject,
  groupPath: string | null,
  projectDirectory: string
): string | null {
  const sourceTree = stringValue(object.values.get("sourceTree"));
  const configuredPath = stringValue(object.values.get("path"));
  if (configuredPath === null) {
    return null;
  }
  if (sourceTree === "SOURCE_ROOT") {
    return joinProjectRelativePath(projectDirectory, configuredPath);
  }
  if (sourceTree === "<group>" && groupPath !== null) {
    return joinProjectRelativePath(groupPath, configuredPath);
  }
  return null;
}

function addResolvedFilePath(
  pathsByFileReference: Map<string, Set<string>>,
  fileReferenceId: string,
  filePath: string | null
): void {
  if (filePath === null) {
    return;
  }
  const paths = pathsByFileReference.get(fileReferenceId) ?? new Set<string>();
  paths.add(filePath);
  pathsByFileReference.set(fileReferenceId, paths);
}

function resolveFileReferencePaths(input: {
  readonly root: OpenStepDictionary;
  readonly objects: ReadonlyMap<string, PbxObject>;
  readonly projectDirectory: string;
}): ReadonlyMap<string, ReadonlySet<string>> {
  const pathsByFileReference = new Map<string, Set<string>>();
  const rootObjectId = stringValue(input.root.get("rootObject"));
  const rootObject = rootObjectId === null ? undefined : input.objects.get(rootObjectId);
  const mainGroupId = rootObject === undefined ? null : stringValue(rootObject.values.get("mainGroup"));
  const visitedGroups = new Set<string>();

  const visitGroup = (groupId: string, parentPath: string): void => {
    const group = input.objects.get(groupId);
    if (group?.isa !== "PBXGroup") {
      return;
    }
    const groupPath = resolvedContainerPath(group, parentPath, input.projectDirectory);
    if (groupPath === null) {
      return;
    }
    const visitKey = `${groupId}\u0000${groupPath}`;
    if (visitedGroups.has(visitKey)) {
      return;
    }
    visitedGroups.add(visitKey);
    const children = stringArray(group.values.get("children"));
    if (children === null) {
      return;
    }
    for (const childId of children) {
      const child = input.objects.get(childId);
      if (child?.isa === "PBXGroup") {
        visitGroup(childId, groupPath);
        continue;
      }
      if (child?.isa === "PBXFileReference") {
        addResolvedFilePath(
          pathsByFileReference,
          childId,
          resolvedFileReferencePath(child, groupPath, input.projectDirectory)
        );
      }
    }
  };

  if (mainGroupId !== null) {
    visitGroup(mainGroupId, input.projectDirectory);
  }

  for (const [id, object] of input.objects) {
    if (object.isa !== "PBXFileReference" || stringValue(object.values.get("sourceTree")) !== "SOURCE_ROOT") {
      continue;
    }
    addResolvedFilePath(
      pathsByFileReference,
      id,
      resolvedFileReferencePath(object, null, input.projectDirectory)
    );
  }

  return pathsByFileReference;
}

function xcodeTargetMembershipsForPbx(input: {
  readonly configurationPath: string;
  readonly sourceText: string;
  readonly sourceFilePaths: ReadonlySet<string>;
}): readonly XcodeTargetMembership[] {
  const parsed = parsePbxObjects(input.sourceText);
  const projectDirectory = projectDirectoryFor(input.configurationPath);
  if (parsed === null || projectDirectory === null) {
    return [];
  }
  const filePathsByReference = resolveFileReferencePaths({
    ...parsed,
    projectDirectory
  });
  const memberships = new Map<string, XcodeTargetMembership>();
  for (const [targetObjectId, target] of [...parsed.objects.entries()].sort(([left], [right]) =>
    compareProjectPaths(left, right)
  )) {
    if (target.isa !== "PBXNativeTarget") {
      continue;
    }
    const buildPhaseIds = stringArray(target.values.get("buildPhases"));
    if (buildPhaseIds === null) {
      continue;
    }
    const targetId = `${input.configurationPath}#${targetObjectId}`;
    for (const buildPhaseId of buildPhaseIds) {
      const buildPhase = parsed.objects.get(buildPhaseId);
      if (buildPhase?.isa !== "PBXSourcesBuildPhase") {
        continue;
      }
      const buildFileIds = stringArray(buildPhase.values.get("files"));
      if (buildFileIds === null) {
        continue;
      }
      for (const buildFileId of buildFileIds) {
        const buildFile = parsed.objects.get(buildFileId);
        const fileReferenceId =
          buildFile?.isa === "PBXBuildFile" ? stringValue(buildFile.values.get("fileRef")) : null;
        if (fileReferenceId === null) {
          continue;
        }
        const paths = filePathsByReference.get(fileReferenceId);
        if (paths === undefined || paths.size !== 1) {
          continue;
        }
        const filePath = [...paths][0];
        if (filePath === undefined || !input.sourceFilePaths.has(filePath)) {
          continue;
        }
        const membership: XcodeTargetMembership = {
          filePath,
          targetId,
          configurationPath: input.configurationPath
        };
        memberships.set(`${filePath}\u0000${targetId}`, membership);
      }
    }
  }
  return [...memberships.values()].sort((left, right) => {
    const byFilePath = compareProjectPaths(left.filePath, right.filePath);
    return byFilePath === 0 ? compareProjectPaths(left.targetId, right.targetId) : byFilePath;
  });
}

async function discoverXcodeProjectConfigurationPaths(projectPath: string): Promise<readonly string[]> {
  const configurationPaths: string[] = [];

  const visitDirectory = async (directoryPath: string): Promise<void> => {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => compareProjectPaths(left.name, right.name))) {
      if (!entry.isDirectory() || HARD_EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      const entryPath = resolve(directoryPath, entry.name);
      if (entry.name.endsWith(".xcodeproj")) {
        const projectEntries = await readdir(entryPath, { withFileTypes: true });
        const projectFile = projectEntries.find(
          (projectEntry) => projectEntry.name === "project.pbxproj" && projectEntry.isFile()
        );
        if (projectFile !== undefined) {
          configurationPaths.push(
            toProjectRelativePath(projectPath, resolve(entryPath, projectFile.name))
          );
        }
        continue;
      }
      await visitDirectory(entryPath);
    }
  };

  await visitDirectory(resolve(projectPath));
  return configurationPaths.sort(compareProjectPaths);
}

/**
 * Reads source membership from every in-project Xcode project. Only
 * `PBXNativeTarget` source build-phase records that resolve to discovered
 * source documents are retained; malformed or unresolvable project syntax is
 * intentionally ignored rather than guessed.
 */
export async function detectXcodeProjectEvidence(
  projectPath: string,
  sourceDocuments: readonly SourceDocument[]
): Promise<XcodeProjectEvidence> {
  const normalizedProjectPath = resolve(projectPath);
  const configurationPaths = await discoverXcodeProjectConfigurationPaths(normalizedProjectPath);
  const sourceFilePaths = new Set(sourceDocuments.map((document) => document.relativePath));
  const projects = await Promise.all(
    configurationPaths.map(async (configurationPath) => {
      const configurationInput = await readProjectConfigurationInput(
        normalizedProjectPath,
        "xcode-project",
        configurationPath
      );
      if (configurationInput.state === "absent") {
        return { configurationInput, targetMemberships: [] as readonly XcodeTargetMembership[] };
      }
      const sourceText = await readFile(
        resolve(normalizedProjectPath, ...configurationPath.split("/")),
        "utf8"
      );
      return {
        configurationInput,
        targetMemberships: xcodeTargetMembershipsForPbx({
          configurationPath,
          sourceText,
          sourceFilePaths
        })
      };
    })
  );

  return {
    configurationInputs: projects.map((project) => project.configurationInput),
    targetMemberships: projects
      .flatMap((project) => project.targetMemberships)
      .sort((left, right) => {
        const byFilePath = compareProjectPaths(left.filePath, right.filePath);
        return byFilePath === 0 ? compareProjectPaths(left.targetId, right.targetId) : byFilePath;
      })
  };
}
