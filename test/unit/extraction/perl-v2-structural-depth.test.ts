import { describe, expect, it } from "vitest";

import { extractPerlFileFacts } from "../../../src/extraction/perl.js";

function declarations(facts: ReturnType<typeof extractPerlFileFacts>) {
  return facts.symbols.filter((symbol) => symbol.kind !== "file");
}

function contains(facts: ReturnType<typeof extractPerlFileFacts>) {
  return facts.edges.filter((edge) => edge.kind === "contains");
}

describe("Perl structural depth v2", () => {
  it("extracts multiple packages, forward subs, prototypes, attributes, and package containment", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/Geometry.pm",
      language: "perl",
      sourceText: `package Geometry;

sub forward;
sub distance($$) :lvalue {
    my ($left, $right) = @_;
    return $left - $right;
}
sub translate {
    my ($point) = @_;
    return $point;
}

package Geometry::Point;
sub new { bless {}, shift }
`
    });
    expect(declarations(facts)).toEqual([
      expect.objectContaining({ kind: "class", name: "Geometry" }),
      expect.objectContaining({ kind: "function", name: "forward" }),
      expect.objectContaining({ kind: "function", name: "distance" }),
      expect.objectContaining({ kind: "function", name: "translate" }),
      expect.objectContaining({ kind: "class", name: "Geometry::Point" }),
      expect.objectContaining({ kind: "function", name: "new" })
    ]);
    expect(contains(facts)).toHaveLength(6);
    expect(contains(facts).every((edge) => edge.resolution === "exact" && edge.confidence === 1)).toBe(true);
  });

  it("does not treat anonymous subs, quote-like strings, or eval text as declarations", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/Dynamic.pm",
      language: "perl",
      sourceText: `package Dynamic;
my $anonymous = sub { return 1 };
my $quoted = q{sub fake { return 1 }};
eval 'sub generated { return 1 }';
sub real { return $quoted }
`
    });
    expect(declarations(facts)).toEqual([
      expect.objectContaining({ kind: "class", name: "Dynamic" }),
      expect.objectContaining({ kind: "function", name: "real" })
    ]);
  });

  it("extracts bounded class and role declarations without descending into their bodies", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/Shapes.pm",
      language: "perl",
      sourceText: `class Shape {
    method area { 1 }
}
role Measurable {
    requires area;
}
`
    });
    expect(declarations(facts)).toEqual([
      expect.objectContaining({ kind: "class", name: "Shape" }),
      expect.objectContaining({ kind: "class", name: "Measurable" })
    ]);
    expect(contains(facts)).toHaveLength(2);
  });

  it("fails closed for malformed package/sub structure", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/Broken.pm",
      language: "perl",
      sourceText: `package Broken;
sub missing {
    return 1;
`
    });
    expect(declarations(facts)).toEqual([]);
  });

  it("treats POD bodies as opaque while preserving following declarations", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/Pod.pm",
      language: "perl",
      sourceText: `package Pod;
=head1 DESCRIPTION
sub fake { ([
=cut
sub real { return 1 }
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual(["Pod", "real"]);
  });

  it("accepts POD documentation that continues to the end of the file", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/TrailingPod.pm",
      language: "perl",
      sourceText: `package TrailingPod;
sub real { return 1 }
=head1 METHODS
sub fake { ([
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual(["TrailingPod", "real"]);
  });

  it("keeps regex operators and heredoc bodies out of structural delimiter depth", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/OpaqueSyntax.pm",
      language: "perl",
      sourceText: `package OpaqueSyntax;
sub regexes {
  return 1 if $value =~ /^#([0-9]+)$/;
  return $values[$#values];
  my $group_id = $);
  $value =~ s{([{}])}{[$1]}g;
  $value =~ tr/[]/()/;
}
sub heredoc {
  my $unicode = "🐛";
  my $text = <<'END_TEXT';
sub fake { ([
END_TEXT
  return $text;
}
sub after { return 1 }
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual([
      "OpaqueSyntax",
      "regexes",
      "heredoc",
      "after"
    ]);
  });

  it("stops executable scanning at Perl END and DATA markers", () => {
    for (const marker of ["__END__", "__DATA__"]) {
      const facts = extractPerlFileFacts({
        filePath: "lib/EndMarker.pm",
        language: "perl",
        sourceText: `package EndMarker;
sub before { return 1 }
${marker}
=head1 DATA
sub fake { ([
`
      });
      expect(declarations(facts).map((symbol) => symbol.name), marker).toEqual([
        "EndMarker",
        "before"
      ]);
    }
  });

  it("does not treat heredoc lookalikes in comments, strings, or POD as openers", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/HeredocDocs.pm",
      language: "perl",
      sourceText: `package HeredocDocs;
# documentation example: <<COMMENT_EOF
my $text = "documentation <<STRING_EOF";
=head1 EXAMPLE
    <<POD_EOF
=cut
sub real { return 1 }
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual(["HeredocDocs", "real"]);
  });

  it("accepts arbitrary legal quote-like delimiters", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/QuoteDelimiter.pm",
      language: "perl",
      sourceText: `package QuoteDelimiter;
my $text = q^} unmatched structural text^;
sub real { return 1 }
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual(["QuoteDelimiter", "real"]);
  });

  it("keeps heredoc-looking text opaque inside bare regex expression contexts", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/BareRegex.pm",
      language: "perl",
      sourceText: `package BareRegex;
sub assigned { my $matched = /<<ASSIGN_FAKE/; return $matched }
sub returned { return /<<RETURN_FAKE/ }
sub argument { consume(/<<ARGUMENT_FAKE/) }
sub listed { my @matches = (1, /<<LIST_FAKE/); return @matches }
sub after { return 1 }
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual([
      "BareRegex",
      "assigned",
      "returned",
      "argument",
      "listed",
      "after"
    ]);
  });

  it("does not reinterpret ordinary division as a bare regex", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/Division.pm",
      language: "perl",
      sourceText: `package Division;
sub ratio { return $left / $right }
sub after { return 1 }
`
    });
    expect(declarations(facts).map((symbol) => symbol.name)).toEqual([
      "Division",
      "ratio",
      "after"
    ]);
  });

  it("still fails closed for an unterminated bare regex", () => {
    const facts = extractPerlFileFacts({
      filePath: "lib/BrokenBareRegex.pm",
      language: "perl",
      sourceText: `package BrokenBareRegex;
my $matched = /unterminated <<FAKE;
sub fake { return 1 }
`
    });
    expect(declarations(facts)).toEqual([]);
  });
});
