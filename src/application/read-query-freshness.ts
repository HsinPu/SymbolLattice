/**
 * Host proof that automatic synchronization completed for one active
 * generation immediately before a read-only worker request was dispatched.
 */
export interface ReadQueryFreshnessReceipt {
  readonly expectedGenerationId: string;
  readonly freshnessVerified: true;
}

/** Internal retry signal; it is consumed by the MCP pool and never rendered. */
export class ReadQueryGenerationMismatchError extends Error {
  public constructor() {
    super("The active SymbolLattice generation changed during the read query.");
    this.name = "ReadQueryGenerationMismatchError";
  }
}
