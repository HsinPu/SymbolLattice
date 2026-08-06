export const CONTEXT_SOURCE_ALLOCATION_POLICY = "reference-order-source-v1" as const;
export const DEFAULT_CONTEXT_SOURCE_CHARACTER_BUDGET = 24_000;
export const MIN_CONTEXT_SOURCE_CHARACTER_BUDGET = 2_048;
export const MAX_CONTEXT_SOURCE_CHARACTER_BUDGET = 64_000;
export const CONTEXT_SOURCE_MINIMUM_PER_REFERENCE = 256;
export const CONTEXT_SOURCE_MAXIMUM_REFERENCES = 8;

export interface ContextSourceAllocationCandidate {
  readonly referenceIndex: number;
  readonly reference: string;
  readonly filePath: string;
  readonly requestedCharacters: number;
}

export interface ContextSourceReferenceAllocation {
  readonly referenceIndex: number;
  readonly reference: string;
  readonly filePath: string;
  readonly requestedCharacters: number;
  readonly referenceOrderWeight: number;
  readonly allocatedCharacters: number;
  readonly truncated: boolean;
  readonly reason: "reference-order-weight";
}

export interface ContextSourceAllocation {
  readonly policy: typeof CONTEXT_SOURCE_ALLOCATION_POLICY;
  readonly budget: {
    readonly characterBudget: number;
    readonly minimumCharacterBudget: number;
    readonly maximumCharacterBudget: number;
    readonly minimumPerReference: number;
  };
  readonly summary: {
    readonly candidateCount: number;
    readonly requestedCharacters: number;
    readonly allocatedCharacters: number;
    readonly unusedCharacters: number;
    readonly truncated: boolean;
  };
  readonly contexts: readonly ContextSourceReferenceAllocation[];
}

interface MutableAllocation {
  readonly candidate: ContextSourceAllocationCandidate;
  readonly referenceOrderWeight: number;
  allocatedCharacters: number;
}

/**
 * Reserves one strict source envelope across exact context references. Caller
 * order is the only relevance claim; short excerpts return unused capacity to
 * later rounds instead of padding or synthesizing source.
 */
export function allocateContextSource(input: {
  readonly candidates: readonly ContextSourceAllocationCandidate[];
  readonly characterBudget: number;
  readonly referenceCount: number;
}): ContextSourceAllocation {
  validateContextSourceAllocation(input);
  const allocations: MutableAllocation[] = [...input.candidates]
    .sort((left, right) => left.referenceIndex - right.referenceIndex)
    .map((candidate) => ({
      candidate,
      referenceOrderWeight: input.referenceCount - candidate.referenceIndex,
      allocatedCharacters: Math.min(
        candidate.requestedCharacters,
        CONTEXT_SOURCE_MINIMUM_PER_REFERENCE
      )
    }));

  let remaining = input.characterBudget - allocations.reduce(
    (total, allocation) => total + allocation.allocatedCharacters,
    0
  );
  while (remaining > 0) {
    const active = allocations.filter(
      (allocation) => allocation.allocatedCharacters < allocation.candidate.requestedCharacters
    );
    if (active.length === 0) break;
    const totalWeight = active.reduce(
      (total, allocation) => total + allocation.referenceOrderWeight,
      0
    );
    const roundCapacity = remaining;
    let distributed = 0;
    for (const allocation of active) {
      if (remaining === 0) break;
      const unmet = allocation.candidate.requestedCharacters - allocation.allocatedCharacters;
      const weightedShare = Math.max(
        1,
        Math.floor(roundCapacity * allocation.referenceOrderWeight / totalWeight)
      );
      const addition = Math.min(unmet, weightedShare, remaining);
      allocation.allocatedCharacters += addition;
      remaining -= addition;
      distributed += addition;
    }
    if (distributed === 0) break;
  }

  const contexts = allocations.map((allocation): ContextSourceReferenceAllocation => ({
    referenceIndex: allocation.candidate.referenceIndex,
    reference: allocation.candidate.reference,
    filePath: allocation.candidate.filePath,
    requestedCharacters: allocation.candidate.requestedCharacters,
    referenceOrderWeight: allocation.referenceOrderWeight,
    allocatedCharacters: allocation.allocatedCharacters,
    truncated: allocation.allocatedCharacters < allocation.candidate.requestedCharacters,
    reason: "reference-order-weight"
  }));
  const requestedCharacters = contexts.reduce(
    (total, context) => total + context.requestedCharacters,
    0
  );
  const allocatedCharacters = contexts.reduce(
    (total, context) => total + context.allocatedCharacters,
    0
  );
  return {
    policy: CONTEXT_SOURCE_ALLOCATION_POLICY,
    budget: {
      characterBudget: input.characterBudget,
      minimumCharacterBudget: MIN_CONTEXT_SOURCE_CHARACTER_BUDGET,
      maximumCharacterBudget: MAX_CONTEXT_SOURCE_CHARACTER_BUDGET,
      minimumPerReference: CONTEXT_SOURCE_MINIMUM_PER_REFERENCE
    },
    summary: {
      candidateCount: contexts.length,
      requestedCharacters,
      allocatedCharacters,
      unusedCharacters: input.characterBudget - allocatedCharacters,
      truncated: contexts.some((context) => context.truncated)
    },
    contexts
  };
}

function validateContextSourceAllocation(input: {
  readonly candidates: readonly ContextSourceAllocationCandidate[];
  readonly characterBudget: number;
  readonly referenceCount: number;
}): void {
  if (
    !Number.isSafeInteger(input.characterBudget) ||
    input.characterBudget < MIN_CONTEXT_SOURCE_CHARACTER_BUDGET ||
    input.characterBudget > MAX_CONTEXT_SOURCE_CHARACTER_BUDGET
  ) {
    throw new RangeError(
      `Context source character budget must be a whole number from ${MIN_CONTEXT_SOURCE_CHARACTER_BUDGET} to ${MAX_CONTEXT_SOURCE_CHARACTER_BUDGET}.`
    );
  }
  if (
    !Number.isSafeInteger(input.referenceCount) ||
    input.referenceCount < 0 ||
    input.referenceCount > CONTEXT_SOURCE_MAXIMUM_REFERENCES ||
    input.candidates.length > input.referenceCount ||
    (input.referenceCount === 0 && input.candidates.length > 0)
  ) {
    throw new RangeError(
      `Context source reference count must be from 0 to ${CONTEXT_SOURCE_MAXIMUM_REFERENCES}, with zero reserved for an empty candidate set.`
    );
  }

  const indexes = new Set<number>();
  for (const candidate of input.candidates) {
    if (
      !Number.isSafeInteger(candidate.referenceIndex) ||
      candidate.referenceIndex < 0 ||
      candidate.referenceIndex >= input.referenceCount
    ) {
      throw new RangeError("Context source candidate reference index is outside the request.");
    }
    if (indexes.has(candidate.referenceIndex)) {
      throw new RangeError(`Context source allocation received duplicate reference index: ${candidate.referenceIndex}.`);
    }
    indexes.add(candidate.referenceIndex);
    if (candidate.reference.length === 0 || candidate.filePath.length === 0) {
      throw new RangeError("Context source allocation requires non-empty reference and file path values.");
    }
    if (!Number.isSafeInteger(candidate.requestedCharacters) || candidate.requestedCharacters <= 0) {
      throw new RangeError("Context source requested characters must be a positive whole number.");
    }
  }
}
