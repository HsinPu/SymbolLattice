export const ASTRO_ENDPOINT_SOURCE_EXTENSIONS = [".ts", ".js", ".mjs"] as const;

interface AstroFilesystemRouteOptions {
  readonly allowTerminalParameterSuffix?: boolean;
}

/**
 * Converts a bounded Astro `src/pages` source path into its public route.
 * Parameters must remain unambiguous; endpoints additionally permit a final
 * output suffix such as `[id].json.ts`.
 */
export function astroFilesystemRoutePath(
  filePath: string,
  sourceExtensions: readonly string[],
  options?: AstroFilesystemRouteOptions
): string | null {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const lowerPath = normalizedPath.toLowerCase();
  const extension = sourceExtensions.find((candidate) => lowerPath.endsWith(candidate.toLowerCase()));
  const prefix = "src/pages/";
  if (extension === undefined || !normalizedPath.startsWith(prefix)) {
    return null;
  }

  const withoutExtension = normalizedPath.slice(prefix.length, -extension.length);
  if (withoutExtension.length === 0) {
    return null;
  }
  const segments = withoutExtension.split("/");
  const fileSegments = segments.at(-1) === "index" ? segments.slice(0, -1) : segments;
  const routeSegments: string[] = [];
  const parameterNames = new Set<string>();

  for (const [index, segment] of fileSegments.entries()) {
    const parameter = /^\[([A-Za-z][A-Za-z0-9_]*)\]$/u.exec(segment);
    const restParameter = /^\[\.\.\.([A-Za-z][A-Za-z0-9_]*)\]$/u.exec(segment);
    const terminalSuffix =
      options?.allowTerminalParameterSuffix === true && index === fileSegments.length - 1
        ? /^\[([A-Za-z][A-Za-z0-9_]*)\]([A-Za-z0-9._~-]+)$/u.exec(segment)
        : null;

    if (restParameter !== null) {
      const name = restParameter[1];
      if (name === undefined || index !== fileSegments.length - 1 || parameterNames.has(name)) {
        return null;
      }
      parameterNames.add(name);
      routeSegments.push("*" + name);
      continue;
    }
    if (parameter !== null) {
      const name = parameter[1];
      if (name === undefined || parameterNames.has(name)) {
        return null;
      }
      parameterNames.add(name);
      routeSegments.push(":" + name);
      continue;
    }
    if (terminalSuffix !== null) {
      const name = terminalSuffix[1];
      const suffix = terminalSuffix[2];
      if (name === undefined || suffix === undefined || parameterNames.has(name)) {
        return null;
      }
      parameterNames.add(name);
      routeSegments.push(":" + name + suffix);
      continue;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(segment) || segment.startsWith("_")) {
      return null;
    }
    routeSegments.push(segment);
  }

  return routeSegments.length === 0 ? "/" : "/" + routeSegments.join("/");
}

export function astroEndpointPath(filePath: string): string | null {
  return astroFilesystemRoutePath(filePath, ASTRO_ENDPOINT_SOURCE_EXTENSIONS, {
    allowTerminalParameterSuffix: true
  });
}
