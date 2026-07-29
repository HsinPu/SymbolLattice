/**
 * A project-local configuration cannot safely be used to build a graph.
 *
 * Infrastructure adapters throw this domain-level error so application use
 * cases can distinguish a malformed or unsupported config from filesystem and
 * storage failures without depending on a concrete adapter implementation.
 */
export class ProjectConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectConfigurationError";
  }
}
