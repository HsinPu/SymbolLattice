import { describe, expect, it } from "vitest";

import { collectPerlTruth, PERL_POSITIVE_QUOTAS } from "../../../scripts/perl-large-project-correctness-oracle.mjs";

describe("Perl large-project correctness oracle", () => {
  it("keeps comments, literals, and nested declarations out of independent truth", () => {
    const facts = collectPerlTruth(
      "fixture",
      "lib/probe.pm",
      `# sub fake() {}
my $text = q{sub alsoFake() {}};
package Real;
sub render {
  return 1;
}
if (1) { sub hidden { 1 } }
`
    );
    expect(facts.filter((fact) => ["identity", "typeIdentity"].includes(fact.stratum)).map((fact) => fact.target)).toEqual([
      expect.objectContaining({ name: "Real", kind: "class" }),
      expect.objectContaining({ name: "render", kind: "function" })
    ]);
    expect(facts.filter((fact) => fact.stratum === "containment")).toHaveLength(2);
  });

  it("defines quotas above the minimum positive evidence target", () => {
    expect(Object.values(PERL_POSITIVE_QUOTAS).reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(300);
  });
});
