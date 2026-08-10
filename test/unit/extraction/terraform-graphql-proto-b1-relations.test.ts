import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";
import type { ArtifactFacts, GraphEdge } from "../../../src/domain/index.js";

function references(facts: ArtifactFacts): readonly GraphEdge[] {
  return facts.edges.filter((edge) => edge.kind === "references");
}

describe("Terraform, GraphQL, and Proto B1 relations", () => {
  it("links one direct Terraform output traversal to its unique same-file resource", () => {
    const facts = extractFileFacts({
      filePath: "infra/main.tf",
      language: "terraform",
      sourceText: [
        'resource "aws_instance" "web" {}',
        'output "endpoint" {',
        "  value = aws_instance.web.public_dns",
        "}"
      ].join("\n")
    });
    const output = facts.symbols.find((symbol) => symbol.name === "output endpoint");
    const resource = facts.symbols.find((symbol) => symbol.name === "resource aws_instance.web");

    expect(references(facts)).toEqual([
      expect.objectContaining({
        sourceId: output?.id,
        targetId: resource?.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "aws_instance.web",
        range: {
          start: { line: 3, column: 11 },
          end: { line: 3, column: 27 }
        },
        evidence: {
          ruleId: "syntax.terraform.same-file.unique-output-resource-traversal",
          stage: "syntax",
          candidateSymbolIds: [resource?.id]
        }
      })
    ]);
  });

  it("fails closed for ambiguous or non-direct Terraform traversals", () => {
    const cases = [
      ['output "endpoint" { value = aws_instance.web.id }'],
      [
        'resource "aws_instance" "web" {}',
        'resource "aws_instance" "web" {}',
        'output "endpoint" { value = aws_instance.web.id }'
      ],
      [
        'resource "aws_instance" "web" {}',
        'output "endpoint" { value = coalesce(aws_instance.web.id, "") }'
      ],
      [
        'resource "aws_instance" "web" {}',
        'output "endpoint" { value = aws_instance.web.network_interface[0].id }'
      ]
    ];
    for (const lines of cases) {
      const facts = extractFileFacts({
        filePath: "infra/main.tf",
        language: "terraform",
        sourceText: lines.join("\n")
      });
      expect(references(facts), lines.join("\n")).toEqual([]);
    }
  });

  it("links one GraphQL object to its unique directly implemented interface", () => {
    const facts = extractFileFacts({
      filePath: "api/schema.graphql",
      language: "graphql",
      sourceText: ["interface Node { id: ID! }", "type User implements Node { id: ID! }"].join("\n")
    });
    const user = facts.symbols.find((symbol) => symbol.name === "User");
    const node = facts.symbols.find((symbol) => symbol.name === "Node");

    expect(facts.edges.filter((edge) => edge.kind === "extends")).toEqual([
      expect.objectContaining({
        sourceId: user?.id,
        targetId: node?.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "Node",
        range: {
          start: { line: 2, column: 22 },
          end: { line: 2, column: 26 }
        },
        evidence: {
          ruleId: "syntax.graphql.same-file.unique-direct-interface-implementation",
          stage: "syntax",
          candidateSymbolIds: [node?.id]
        }
      })
    ]);
  });

  it("fails closed for ambiguous or complex GraphQL interface implementations", () => {
    const cases = [
      "type User implements Node { id: ID! }",
      ["interface Node { id: ID! }", "interface Node { key: ID! }", "type User implements Node { id: ID! }"].join("\n"),
      ["interface Node { id: ID! }", "interface Auditable { id: ID! }", "type User implements Node & Auditable { id: ID! }"].join("\n"),
      ["interface Node { id: ID! }", "type User implements Node @key(fields: \"id\") { id: ID! }"].join("\n")
    ];
    for (const sourceText of cases) {
      const facts = extractFileFacts({ filePath: "api/schema.graphql", language: "graphql", sourceText });
      expect(facts.edges.filter((edge) => edge.kind === "extends"), sourceText).toEqual([]);
    }
  });

  it("links a direct Proto RPC to unique same-file request and response messages", () => {
    const facts = extractFileFacts({
      filePath: "api/smoke.proto",
      language: "proto",
      sourceText: [
        'syntax = "proto3";',
        "message HelloRequest {}",
        "message HelloResponse {}",
        "service Greeter {",
        "  rpc SayHello(HelloRequest) returns (HelloResponse);",
        "}"
      ].join("\n")
    });
    const rpc = facts.symbols.find((symbol) => symbol.name === "SayHello");
    const request = facts.symbols.find((symbol) => symbol.name === "HelloRequest");
    const response = facts.symbols.find((symbol) => symbol.name === "HelloResponse");

    expect(references(facts)).toEqual([
      expect.objectContaining({
        sourceId: rpc?.id,
        targetId: request?.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "HelloRequest",
        range: {
          start: { line: 5, column: 16 },
          end: { line: 5, column: 28 }
        },
        evidence: {
          ruleId: "syntax.proto.same-file.unique-rpc-request-message-reference",
          stage: "syntax",
          candidateSymbolIds: [request?.id]
        }
      }),
      expect.objectContaining({
        sourceId: rpc?.id,
        targetId: response?.id,
        resolution: "exact",
        confidence: 1,
        referenceName: "HelloResponse",
        range: {
          start: { line: 5, column: 39 },
          end: { line: 5, column: 52 }
        },
        evidence: {
          ruleId: "syntax.proto.same-file.unique-rpc-response-message-reference",
          stage: "syntax",
          candidateSymbolIds: [response?.id]
        }
      })
    ]);
  });

  it("fails closed for imported, qualified, ambiguous, or block-bodied Proto RPC types", () => {
    const cases = [
      ["message HelloResponse {}", "service Greeter { rpc SayHello(HelloRequest) returns (HelloResponse); }"] ,
      ["message HelloRequest {}", "message HelloResponse {}", "service Greeter { rpc SayHello(.other.HelloRequest) returns (HelloResponse); }"] ,
      ['import "other.proto";', "message HelloRequest {}", "message HelloResponse {}", "service Greeter { rpc SayHello(HelloRequest) returns (HelloResponse); }"] ,
      ["message HelloRequest {}", "message HelloRequest {}", "message HelloResponse {}", "service Greeter { rpc SayHello(HelloRequest) returns (HelloResponse); }"] ,
      ["message HelloRequest {}", "message HelloResponse {}", "service Greeter { rpc SayHello(HelloRequest) returns (HelloResponse) {} }"]
    ];
    for (const lines of cases) {
      const sourceText = lines.join("\n");
      const facts = extractFileFacts({ filePath: "api/smoke.proto", language: "proto", sourceText });
      expect(references(facts), sourceText).toEqual([]);
    }
  });
});
