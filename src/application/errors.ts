export class SymbolLatticeError extends Error {
  public constructor(
    public readonly code:
      | "AMBIGUOUS_SYMBOL"
      | "EDGE_NOT_FOUND"
      | "INVALID_CONTEXT_IMPACT_DEPTH"
      | "INVALID_CONTEXT_IMPACT_LIMIT"
      | "INVALID_CONTEXT_MAX_HOPS"
      | "INVALID_CONTEXT_REFERENCES"
      | "INVALID_CONTEXT_RELATION_LIMIT"
      | "INVALID_IMPACT_DEPTH"
      | "INVALID_IMPACT_LIMIT"
      | "INVALID_PROJECT_CONFIGURATION"
      | "INVALID_PROJECT_PATH"
      | "INVALID_SEARCH_LANGUAGE"
      | "INVALID_SEARCH_LIMIT"
      | "INVALID_SEARCH_PATH_PREFIX"
      | "INVALID_SEARCH_QUERY"
      | "MISSING_INDEX"
      | "SOURCE_SEARCH_UNAVAILABLE"
      | "SYMBOL_NOT_FOUND"
      | "UNSUPPORTED_NODE_VERSION",
    message: string
  ) {
    super(message);
    this.name = "SymbolLatticeError";
  }
}
