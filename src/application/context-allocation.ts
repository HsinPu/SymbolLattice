export const INVESTIGATION_SOURCE_ALLOCATION_POLICY = "proportional-source-v1";
export const DEFAULT_INVESTIGATION_SOURCE_CHARACTER_BUDGET = 24_000;
export const MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET = 2_048;
export const MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET = 64_000;
export const INVESTIGATION_SOURCE_MINIMUM_PER_FILE = 256;
export const INVESTIGATION_GENERATED_WORTH_MULTIPLIER = 0.25;
const MAX_ALLOCATION_FILES = 8;

export type InvestigationSourceAllocationReason =
  | "selection-rank-weight"
  | "generated-file-worth-penalty";

export interface InvestigationSourceAllocationCandidate {
  readonly filePath: string;
  readonly requestedCharacters: number;
  readonly selectionRanks: readonly number[];
  readonly generatedPenalty: 0 | 1;
}

export interface InvestigationSourceFileAllocation {
  readonly filePath: string;
  readonly selectionRanks: readonly number[];
  readonly requestedCharacters: number;
  readonly rankWeight: number;
  readonly generatedMultiplier: number;
  readonly effectiveWeight: number;
  readonly allocatedCharacters: number;
  readonly truncated: boolean;
  readonly reason: InvestigationSourceAllocationReason;
}

export interface InvestigationSourceAllocation {
  readonly policy: typeof INVESTIGATION_SOURCE_ALLOCATION_POLICY;
  readonly budget: {
    readonly characterBudget: number;
    readonly minimumCharacterBudget: number;
    readonly maximumCharacterBudget: number;
    readonly minimumPerFile: number;
  };
  readonly summary: {
    readonly candidateFileCount: number;
    readonly requestedCharacters: number;
    readonly allocatedCharacters: number;
    readonly unusedCharacters: number;
    readonly truncated: boolean;
  };
  readonly files: readonly InvestigationSourceFileAllocation[];
}

interface MutableAllocation {
  readonly candidate: InvestigationSourceAllocationCandidate;
  readonly rankWeight: number;
  readonly generatedMultiplier: number;
  readonly effectiveWeight: number;
  allocatedCharacters: number;
}

/**
 * Reserves one strict source-character envelope across selected files. Rank is
 * the only relevance claim; generated evidence adjusts byte worth, never
 * admission. Capacity a short file cannot spend is redistributed.
 */
export function allocateInvestigationSource(input: {
  readonly candidates: readonly InvestigationSourceAllocationCandidate[];
  readonly characterBudget: number;
  readonly selectionCount: number;
}): InvestigationSourceAllocation {
  validateAllocationInput(input);
  const ordered = [...input.candidates].sort(
    (left, right) =>
      Math.min(...left.selectionRanks) - Math.min(...right.selectionRanks) ||
      left.filePath.localeCompare(right.filePath, "en")
  );
  const allocations: MutableAllocation[] = ordered.map((candidate) => {
    const rankWeight = candidate.selectionRanks.reduce(
      (total, rank) => total + input.selectionCount - rank + 1,
      0
    );
    const generatedMultiplier = candidate.generatedPenalty === 1
      ? INVESTIGATION_GENERATED_WORTH_MULTIPLIER
      : 1;
    return {
      candidate,
      rankWeight,
      generatedMultiplier,
      effectiveWeight: rankWeight * generatedMultiplier,
      allocatedCharacters: Math.min(
        candidate.requestedCharacters,
        INVESTIGATION_SOURCE_MINIMUM_PER_FILE
      )
    };
  });

  let remaining = input.characterBudget - allocations.reduce(
    (total, item) => total + item.allocatedCharacters,
    0
  );
  while (remaining > 0) {
    const active = allocations.filter(
      (item) => item.allocatedCharacters < item.candidate.requestedCharacters
    );
    if (active.length === 0) {
      break;
    }
    const totalWeight = active.reduce((total, item) => total + item.effectiveWeight, 0);
    const availableAtRoundStart = remaining;
    const proposals = active.map((item) => ({
      item,
      characters: Math.max(
        1,
        Math.floor(availableAtRoundStart * item.effectiveWeight / totalWeight)
      )
    }));
    let distributed = 0;
    for (const proposal of proposals) {
      if (remaining === 0) {
        break;
      }
      const unmet = proposal.item.candidate.requestedCharacters - proposal.item.allocatedCharacters;
      const addition = Math.min(unmet, proposal.characters, remaining);
      proposal.item.allocatedCharacters += addition;
      remaining -= addition;
      distributed += addition;
    }
    if (distributed === 0) {
      break;
    }
  }

  const files = allocations.map((item): InvestigationSourceFileAllocation => ({
    filePath: item.candidate.filePath,
    selectionRanks: [...item.candidate.selectionRanks],
    requestedCharacters: item.candidate.requestedCharacters,
    rankWeight: item.rankWeight,
    generatedMultiplier: item.generatedMultiplier,
    effectiveWeight: item.effectiveWeight,
    allocatedCharacters: item.allocatedCharacters,
    truncated: item.allocatedCharacters < item.candidate.requestedCharacters,
    reason: item.candidate.generatedPenalty === 1
      ? "generated-file-worth-penalty"
      : "selection-rank-weight"
  }));
  const requestedCharacters = files.reduce(
    (total, file) => total + file.requestedCharacters,
    0
  );
  const allocatedCharacters = files.reduce(
    (total, file) => total + file.allocatedCharacters,
    0
  );
  return {
    policy: INVESTIGATION_SOURCE_ALLOCATION_POLICY,
    budget: {
      characterBudget: input.characterBudget,
      minimumCharacterBudget: MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET,
      maximumCharacterBudget: MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET,
      minimumPerFile: INVESTIGATION_SOURCE_MINIMUM_PER_FILE
    },
    summary: {
      candidateFileCount: files.length,
      requestedCharacters,
      allocatedCharacters,
      unusedCharacters: input.characterBudget - allocatedCharacters,
      truncated: files.some((file) => file.truncated)
    },
    files
  };
}

function validateAllocationInput(input: {
  readonly candidates: readonly InvestigationSourceAllocationCandidate[];
  readonly characterBudget: number;
  readonly selectionCount: number;
}): void {
  if (
    !Number.isSafeInteger(input.characterBudget) ||
    input.characterBudget < MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET ||
    input.characterBudget > MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET
  ) {
    throw new RangeError(
      `Investigation source character budget must be a whole number from ${MIN_INVESTIGATION_SOURCE_CHARACTER_BUDGET} to ${MAX_INVESTIGATION_SOURCE_CHARACTER_BUDGET}.`
    );
  }
  if (
    !Number.isSafeInteger(input.selectionCount) ||
    input.selectionCount < 0 ||
    input.selectionCount > MAX_ALLOCATION_FILES ||
    (input.selectionCount === 0 && input.candidates.length > 0)
  ) {
    throw new RangeError(`Investigation selection count must be from 0 to ${MAX_ALLOCATION_FILES}, with zero reserved for an empty candidate set.`);
  }
  if (input.candidates.length > MAX_ALLOCATION_FILES) {
    throw new RangeError(`Investigation source allocation accepts at most ${MAX_ALLOCATION_FILES} files.`);
  }

  const paths = new Set<string>();
  const ranks = new Set<number>();
  for (const candidate of input.candidates) {
    if (candidate.filePath.length === 0) {
      throw new RangeError("Investigation source allocation requires a non-empty file path.");
    }
    if (paths.has(candidate.filePath)) {
      throw new RangeError(`Investigation source allocation received duplicate file: ${candidate.filePath}.`);
    }
    paths.add(candidate.filePath);
    if (!Number.isSafeInteger(candidate.requestedCharacters) || candidate.requestedCharacters < 0) {
      throw new RangeError("Investigation requested characters must be a nonnegative whole number.");
    }
    if (candidate.generatedPenalty !== 0 && candidate.generatedPenalty !== 1) {
      throw new RangeError("Investigation generated penalty must be 0 or 1.");
    }
    if (candidate.selectionRanks.length === 0) {
      throw new RangeError("Investigation source allocation requires at least one selection rank per file.");
    }
    for (const rank of candidate.selectionRanks) {
      if (!Number.isSafeInteger(rank) || rank < 1 || rank > input.selectionCount) {
        throw new RangeError("Investigation selection rank is outside the selected symbol range.");
      }
      if (ranks.has(rank)) {
        throw new RangeError(`Investigation source allocation received duplicate selection rank: ${rank}.`);
      }
      ranks.add(rank);
    }
  }
}
