/** Query-time lexical helpers; these broaden candidates, never graph certainty. */
const MAXIMUM_IDENTIFIER_CACHE_ENTRIES = 4096;
const MAXIMUM_IDENTIFIER_CACHE_KEY_CHARACTERS = 256;
const wordCache = new Map<string, readonly string[]>();
const variantCache = new Map<string, readonly string[]>();

/** Cache pure spelling calculations only; callers still receive independent arrays. */
function cachedIdentifierValues(
  value: string,
  cache: Map<string, readonly string[]>,
  compute: (value: string) => readonly string[]
): readonly string[] {
  if (value.length > MAXIMUM_IDENTIFIER_CACHE_KEY_CHARACTERS) return compute(value);
  const cached = cache.get(value);
  if (cached !== undefined) return cached.slice();
  const result = compute(value);
  if (cache.size >= MAXIMUM_IDENTIFIER_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(value, result.slice());
  return result;
}

export function numericIdentifierTerms(terms: readonly string[]): readonly string[] {
  return [...new Set(terms.filter(term => /^\p{N}{3,}$/u.test(term)))];
}

/** Whole digit runs, so a qualifier such as 500 never matches handler5000. */
export function identifierNumbers(name: string): readonly string[] {
  return name.normalize("NFKC").match(/\p{N}+/gu) ?? [];
}

export function identifierWords(value: string): readonly string[] {
  return cachedIdentifierValues(value, wordCache, computeIdentifierWords);
}

function computeIdentifierWords(value: string): readonly string[] {
  return value.normalize("NFKC")
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, "$1 $2")
    .replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, "$1 $2")
    .toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Conventional code abbreviations are lexical alternatives, never semantic equivalence or exact relations.
const CODE_ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  parameter: ["param", "params"], argument: ["arg", "args"], configuration: ["config"],
  context: ["ctx"], request: ["req"], response: ["res", "resp"], message: ["msg"],
  environment: ["env"], error: ["err"], function: ["fn"], information: ["info"]
};

/** English inflections and conventional identifier abbreviations, preserving the original term first. */
export function identifierTermVariants(term: string): readonly string[] {
  return cachedIdentifierValues(term, variantCache, computeIdentifierTermVariants);
}

function computeIdentifierTermVariants(term: string): readonly string[] {
  const variants = new Set([term]);
  // An irregular past tense supplies a lexical alternative, not a call target.
  if (term === "sent") variants.add("send");
  if (!/^[a-z]{4,}$/u.test(term)) return [...variants];
  if (term.endsWith("ies") && term.length > 4) variants.add(`${term.slice(0, -3)}y`);
  else if (/(?:ches|shes|sses|xes|zes)$/u.test(term)) variants.add(term.slice(0, -2));
  else if (term.endsWith("s") && !/(?:ss|us|is)$/u.test(term)) variants.add(term.slice(0, -1));
  if (/(?:ing|ed)$/u.test(term)) {
    const stem = term.replace(/(?:ing|ed)$/u, "");
    if (stem.length >= 3) {
      variants.add(stem);
      variants.add(`${stem}e`);
      if (/([b-df-hj-np-tv-z])\1$/u.test(stem)) variants.add(stem.slice(0, -1));
    }
  }
  for (const variant of [...variants]) {
    if (!Object.hasOwn(CODE_ABBREVIATIONS, variant)) continue;
    for (const abbreviation of CODE_ABBREVIATIONS[variant]!) variants.add(abbreviation);
  }
  return [...variants];
}

/** Merge overlapping inflections so repetition cannot inflate coverage. */
export function identifierTermGroups(terms: readonly string[]): readonly (readonly string[])[] {
  const groups: Set<string>[] = [];
  for (const term of terms) {
    const group = new Set(identifierTermVariants(term));
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      if (![...groups[index]!].some((variant) => group.has(variant))) continue;
      for (const variant of groups[index]!) group.add(variant);
      groups.splice(index, 1);
    }
    groups.push(group);
  }
  return groups.map((group) => [...group]);
}
