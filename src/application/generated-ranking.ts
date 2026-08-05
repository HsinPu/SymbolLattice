import {
  GENERATED_FILE_CLASSIFIER_VERSION,
  generatedClassificationFor,
  type GeneratedFileClassification,
  type IndexedFile
} from "../domain/index.js";

export const GENERATED_SOFT_RANK_POLICY = "generated-soft-rank-v1";

export type GeneratedRankReason =
  | "handwritten-preferred"
  | "generated-file-soft-penalty"
  | "original-order-preserved";

export interface GeneratedRankSignal {
  readonly baseRank: number;
  readonly finalRank: number;
  readonly generatedPenalty: 0 | 1;
  readonly reason: GeneratedRankReason;
}

export interface GeneratedRankingItem extends GeneratedRankSignal {
  readonly itemId: string;
  readonly filePath: string;
  readonly generated: GeneratedFileClassification;
}

export interface GeneratedRankingDiagnostics {
  readonly policy: typeof GENERATED_SOFT_RANK_POLICY;
  readonly classifierVersion: string;
  readonly candidateCount: number;
  readonly returnedCount: number;
  readonly truncated: boolean;
  readonly items: readonly GeneratedRankingItem[];
}

export interface GeneratedRankedValue<T> {
  readonly value: T;
  readonly generated: GeneratedFileClassification;
  readonly ranking: GeneratedRankSignal;
}

/** Stable partition by persisted generated evidence; no candidate is filtered. */
export function rankGeneratedValues<T>(input: {
  readonly values: readonly T[];
  readonly files: readonly IndexedFile[];
  readonly filePath: (value: T) => string;
  readonly itemId: (value: T) => string;
  readonly limit?: number;
}): {
  readonly values: readonly GeneratedRankedValue<T>[];
  readonly diagnostics: GeneratedRankingDiagnostics;
} {
  const filesByPath = new Map(input.files.map((file) => [file.path, file]));
  const candidates = input.values.map((value, index) => {
    const filePath = input.filePath(value);
    const generated = generatedClassificationFor(filesByPath.get(filePath) ?? {});
    return {
      value,
      filePath,
      itemId: input.itemId(value),
      generated,
      baseRank: index + 1,
      generatedPenalty: (generated.generated ? 1 : 0) as 0 | 1
    };
  });
  const containsGenerated = candidates.some((candidate) => candidate.generatedPenalty === 1);
  const containsHandwritten = candidates.some((candidate) => candidate.generatedPenalty === 0);
  const ranked = [...candidates].sort((left, right) =>
    left.generatedPenalty - right.generatedPenalty || left.baseRank - right.baseRank
  );
  const limit = input.limit ?? ranked.length;
  const selected = ranked.slice(0, limit).map((candidate, index): GeneratedRankedValue<T> => ({
    value: candidate.value,
    generated: candidate.generated,
    ranking: {
      baseRank: candidate.baseRank,
      finalRank: index + 1,
      generatedPenalty: candidate.generatedPenalty,
      reason: rankReason(candidate.generatedPenalty, containsGenerated, containsHandwritten)
    }
  }));
  const items = selected.map((item): GeneratedRankingItem => ({
    itemId: input.itemId(item.value),
    filePath: input.filePath(item.value),
    generated: item.generated,
    ...item.ranking
  }));
  const classifierVersions = [...new Set(
    candidates.map((candidate) => candidate.generated.classifierVersion)
  )].sort();

  return {
    values: selected,
    diagnostics: {
      policy: GENERATED_SOFT_RANK_POLICY,
      classifierVersion:
        classifierVersions.length === 1
          ? classifierVersions[0]!
          : classifierVersions.length === 0
            ? GENERATED_FILE_CLASSIFIER_VERSION
            : `mixed:${classifierVersions.join(",")}`,
      candidateCount: candidates.length,
      returnedCount: selected.length,
      truncated: candidates.length > selected.length,
      items
    }
  };
}

function rankReason(
  penalty: 0 | 1,
  containsGenerated: boolean,
  containsHandwritten: boolean
): GeneratedRankReason {
  if (penalty === 1) {
    return "generated-file-soft-penalty";
  }
  return containsGenerated && containsHandwritten
    ? "handwritten-preferred"
    : "original-order-preserved";
}
