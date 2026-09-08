/**
 * Shared, deliberately narrow Python module and mounted-route primitives.
 * Framework projectors consume these helpers through explicit imports so package
 * boundaries and static route prefixes have one implementation.
 */
export function isStaticPythonRoutePrefix(value: string): boolean {
  return value === "" || (value.startsWith("/") && !value.endsWith("/"));
}

export function mountedPythonRoutePath(
  registrationPrefix: string,
  receiverPrefix: string,
  routePath: string
): string | null {
  if (
    !isStaticPythonRoutePrefix(registrationPrefix) ||
    !isStaticPythonRoutePrefix(receiverPrefix) ||
    !routePath.startsWith("/")
  ) {
    return null;
  }
  return `${registrationPrefix}${receiverPrefix}${routePath}`;
}

export function mountedPythonRoutePathParts(parts: readonly string[]): string | null {
  if (parts.length < 2) {
    return null;
  }
  const routePath = parts.at(-1);
  const prefixes = parts.slice(0, -1);
  if (
    routePath === undefined ||
    !routePath.startsWith("/") ||
    !prefixes.every((prefix) => isStaticPythonRoutePrefix(prefix))
  ) {
    return null;
  }
  return [...prefixes, routePath].join("");
}

/**
 * Resolves the intentionally narrow Python framework import surface. A direct
 * `from .module import binding` is accepted only when both files live in one
 * regular package whose traversed directories contain `__init__.py` markers.
 * This primitive excludes namespace packages, parent-relative imports, and
 * circular self-imports. A higher-level resolver may compose it only through
 * persisted, final `__init__.py` re-export facts with dedicated safeguards.
 */
export function resolvePythonRelativeModule(
  knownFilePaths: ReadonlySet<string>,
  fromFilePath: string,
  moduleSpecifier: string
): string | null {
  const normalizedFromPath = fromFilePath.replace(/\\/gu, "/");
  const match = /^\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/u.exec(
    moduleSpecifier
  );
  if (match?.[1] === undefined) {
    return null;
  }

  const packageParts = normalizedFromPath.split("/").slice(0, -1);
  if (packageParts.length === 0) {
    return null;
  }
  const moduleParts = match[1].split(".");
  const moduleBase = [...packageParts, ...moduleParts].join("/");
  const targetCandidates = [`${moduleBase}.py`, `${moduleBase}/__init__.py`].filter((candidate) =>
    knownFilePaths.has(candidate)
  );
  if (targetCandidates.length !== 1 || targetCandidates[0] === undefined) {
    return null;
  }
  const targetFilePath = targetCandidates[0];
  if (targetFilePath === normalizedFromPath) {
    return null;
  }

  const targetDirectoryParts = targetFilePath.split("/").slice(0, -1);
  if (
    targetDirectoryParts.length < packageParts.length ||
    packageParts.some((part, index) => targetDirectoryParts[index] !== part)
  ) {
    return null;
  }
  for (let length = packageParts.length; length <= targetDirectoryParts.length; length += 1) {
    const marker = `${targetDirectoryParts.slice(0, length).join("/")}/__init__.py`;
    if (!knownFilePaths.has(marker)) {
      return null;
    }
  }

  return targetFilePath;
}

/**
 * Resolves one static, absolute dotted Python module name against the project
 * source root. Every dotted package segment must have an `__init__.py` marker;
 * this intentionally excludes namespace packages, external imports, source-root
 * inference, ambiguous file/package targets, and recursive self-includes.
 */
export function resolvePythonAbsoluteModule(
  knownFilePaths: ReadonlySet<string>,
  fromFilePath: string,
  moduleSpecifier: string
): string | null {
  const normalizedFromPath = fromFilePath.replace(/\\/gu, "/");
  const match = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/u.exec(moduleSpecifier);
  if (match?.[1] === undefined) {
    return null;
  }

  const moduleParts = match[1].split(".");
  const moduleBase = moduleParts.join("/");
  const targetCandidates = [`${moduleBase}.py`, `${moduleBase}/__init__.py`].filter((candidate) =>
    knownFilePaths.has(candidate)
  );
  if (targetCandidates.length !== 1 || targetCandidates[0] === undefined) {
    return null;
  }
  const targetFilePath = targetCandidates[0];
  if (targetFilePath === normalizedFromPath) {
    return null;
  }

  const expectedDirectoryParts = targetFilePath.endsWith("/__init__.py")
    ? moduleParts
    : moduleParts.slice(0, -1);
  const targetDirectoryParts = targetFilePath.split("/").slice(0, -1);
  if (
    targetDirectoryParts.length !== expectedDirectoryParts.length ||
    targetDirectoryParts.some((part, index) => part !== expectedDirectoryParts[index])
  ) {
    return null;
  }
  for (let length = 1; length <= expectedDirectoryParts.length; length += 1) {
    const marker = `${expectedDirectoryParts.slice(0, length).join("/")}/__init__.py`;
    if (!knownFilePaths.has(marker)) {
      return null;
    }
  }

  return targetFilePath;
}

export function compactPythonModuleResolutionPath(parts: readonly string[]): readonly string[] {
  const compacted: string[] = [];
  for (const part of parts) {
    if (compacted.at(-1) !== part) {
      compacted.push(part);
    }
  }
  return compacted;
}
