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

  it("keeps POD bodies out of declaration and brace depth truth", () => {
    const facts = collectPerlTruth(
      "fixture",
      "lib/pod.pm",
      `package Pod;
=head1 DESCRIPTION
sub fake { ([
=cut
sub real { return 1 }
`
    );
    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "Pod",
      "real"
    ]);
  });

  it("masks trailing POD, regex operators, and heredoc bodies", () => {
    const facts = collectPerlTruth(
      "fixture",
      "lib/opaque.pm",
      `package Opaque;
sub regexes {
  return 1 if $value =~ /^#([0-9]+)$/;
  return $values[$#values];
  my $group_id = $);
  $value =~ s{([{}])}{[$1]}g;
}
sub heredoc {
  my $unicode = "🐛";
  my $text = <<'END_TEXT';
sub fake { ([
END_TEXT
}
sub after { return 1 }
=head1 METHODS
sub also_fake { ([
`
    );
    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "Opaque",
      "regexes",
      "heredoc",
      "after"
    ]);
  });

  it("treats END and DATA markers as the end of executable declarations", () => {
    const facts = collectPerlTruth(
      "fixture",
      "lib/end.pm",
      `package EndMarker;
sub before { return 1 }
__END__
=head1 DATA
sub fake { ([
`
    );
    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "EndMarker",
      "before"
    ]);
  });

  it("ignores heredoc lookalikes in non-code and accepts arbitrary quote delimiters", () => {
    const facts = collectPerlTruth(
      "fixture",
      "lib/lookalikes.pm",
      `package Lookalikes;
# documentation example: <<COMMENT_EOF
my $text = "documentation <<STRING_EOF";
my $quoted = q^}^;
=head1 EXAMPLE
    <<POD_EOF
=cut
sub real { return 1 }
`
    );
    expect(facts.filter((fact) => fact.kind === "identity").map((fact) => fact.target.name)).toEqual([
      "Lookalikes",
      "real"
    ]);
  });
});
