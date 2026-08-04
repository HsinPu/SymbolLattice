/** Matches one normalized project-relative file or directory without crossing a segment boundary. */
export function matchesProjectPathPrefix(filePath: string, pathPrefix: string): boolean {
  return filePath === pathPrefix || filePath.startsWith(`${pathPrefix}/`);
}
