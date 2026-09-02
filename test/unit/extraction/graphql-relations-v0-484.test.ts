import { describe, expect, it } from "vitest";

import { extractGraphqlFileFacts } from "../../../src/extraction/graphql.js";

describe("GraphQL relation depth v0.484", () => {
  it("retains type/interface identity and direct implements facts", () => {
    const facts = extractGraphqlFileFacts({
      filePath: "schema/user.graphql",
      language: "graphql",
      sourceText: [
        "interface Node { id: ID! }",
        "type User implements Node { id: ID! }"
      ].join("\n")
    });

    expect(facts.graphqlFacts).toMatchObject({ parserRejected: false });
    expect(facts.graphqlFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Node", declarationKind: "interface" }),
      expect.objectContaining({ name: "User", declarationKind: "type" })
    ]));
    expect(facts.graphqlFacts?.heritage).toEqual([
      expect.objectContaining({ sourceName: "User", targetName: "Node" })
    ]);
  });

  it("fails closed for extended or malformed schema files", () => {
    const extended = extractGraphqlFileFacts({
      filePath: "schema/extended.graphql",
      language: "graphql",
      sourceText: "extend type User implements Node { id: ID! }"
    });
    expect(extended.graphqlFacts).toMatchObject({ parserRejected: true, types: [], heritage: [] });

    const malformed = extractGraphqlFileFacts({
      filePath: "schema/broken.graphql",
      language: "graphql",
      sourceText: "interface Node { id: ID!"
    });
    expect(malformed.graphqlFacts).toMatchObject({ parserRejected: true, types: [], heritage: [] });
  });
});
