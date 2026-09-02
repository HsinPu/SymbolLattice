import { describe, expect, it } from "vitest";

import { extractProtoFileFacts } from "../../../src/extraction/proto.js";

describe("Protocol Buffers relation depth v0.483", () => {
  it("retains literal imports and RPC request/response facts", () => {
    const facts = extractProtoFileFacts({
      filePath: "api/service.proto",
      language: "proto",
      sourceText: [
        'syntax = "proto3";',
        'import "messages.proto";',
        "service Greeter {",
        "  rpc Say(HelloRequest) returns (HelloResponse);",
        "}"
      ].join("\n")
    });

    expect(facts.protoFacts).toMatchObject({ parserRejected: false });
    expect(facts.protoFacts?.imports).toEqual([
      expect.objectContaining({ importPath: "messages.proto", importKind: "plain" })
    ]);
    expect(facts.protoFacts?.rpcs).toEqual([
      expect.objectContaining({ name: "Say", requestName: "HelloRequest", responseName: "HelloResponse" })
    ]);
  });

  it("ignores imports inside comments and rejects malformed source", () => {
    const commented = extractProtoFileFacts({
      filePath: "api/commented.proto",
      language: "proto",
      sourceText: "// import \"hidden.proto\";\nmessage Visible {}\n"
    });
    expect(commented.protoFacts?.imports).toEqual([]);

    const malformed = extractProtoFileFacts({
      filePath: "api/malformed.proto",
      language: "proto",
      sourceText: 'import "messages.proto";\nservice Broken { rpc Say(HelloRequest) returns (HelloResponse);\n'
    });
    expect(malformed.protoFacts).toMatchObject({ parserRejected: true, imports: [], types: [], rpcs: [] });
  });
});
