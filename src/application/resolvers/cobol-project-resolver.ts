import { compareStableText, type PendingReference, type SymbolNode } from "../../domain/index.js";
import type { ExtractedFileFacts } from "../../extraction/index.js";

const CICS_TRANSACTION_REFERENCE = /^cics-transid:([A-Za-z0-9$#@]{1,4})$/iu;

export interface CobolCicsTransactionResolution {
  readonly candidates: readonly SymbolNode[];
  readonly target: SymbolNode | null;
}

/**
 * CICS transaction-to-program definitions reside in an external CSD. A unique
 * source-proven TRAN-named COBOL owner is therefore a bounded convention, not
 * an exact runtime guarantee. Ambiguity deliberately remains unresolved.
 */
export function resolveCobolCicsTransactionTarget(input: {
  readonly reference: PendingReference;
  readonly factsByFile: ReadonlyMap<string, ExtractedFileFacts>;
  readonly symbolsById: ReadonlyMap<string, SymbolNode>;
}): CobolCicsTransactionResolution | null {
  const match = CICS_TRANSACTION_REFERENCE.exec(input.reference.referenceName);
  const transactionId = match?.[1]?.toUpperCase();
  if (transactionId === undefined) {
    return null;
  }

  const candidatesById = new Map<string, SymbolNode>();
  for (const facts of input.factsByFile.values()) {
    for (const owner of facts.cobolCicsFacts?.transactionOwners ?? []) {
      if (owner.transactionId.toUpperCase() !== transactionId) {
        continue;
      }
      const target = input.symbolsById.get(owner.programId);
      if (target !== undefined) {
        candidatesById.set(target.id, target);
      }
    }
  }
  const candidates = [...candidatesById.values()].sort((left, right) => compareStableText(left.id, right.id));
  return {
    candidates,
    target: candidates.length === 1 ? candidates[0] ?? null : null
  };
}
