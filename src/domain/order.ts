/**
 * Byte-wise text ordering that does not inherit host locale settings. Source
 * paths, IDs, and generated graph payloads use this wherever ordering becomes
 * persisted or externally observable.
 */
export function compareStableText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
