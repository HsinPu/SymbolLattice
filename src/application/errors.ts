export class SymbolLatticeError extends Error {
  public constructor(
    public readonly code:
      | "AMBIGUOUS_SYMBOL"
      | "INVALID_PROJECT_PATH"
      | "MISSING_INDEX"
      | "SYMBOL_NOT_FOUND"
      | "UNSUPPORTED_NODE_VERSION",
    message: string
  ) {
    super(message);
    this.name = "SymbolLatticeError";
  }
}
