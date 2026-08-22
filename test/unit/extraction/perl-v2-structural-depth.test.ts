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
});
