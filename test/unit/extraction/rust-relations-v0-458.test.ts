import { describe, expect, it } from "vitest";

import { extractRustFileFacts } from "../../../src/extraction/rust.js";

describe("Rust v0.458 project relation facts", () => {
  it("retains struct, trait, impl, method-call, associated-call, and construction facts", () => {
    const facts = extractRustFileFacts({
      filePath: "src/service.rs",
      language: "rust",
      sourceText: `
pub struct Service { value: i32 }

impl Service {
  pub fn new() -> Self { Service { value: 0 } }
  pub fn run(&self) {}
}

impl Worker for Service {
  fn run(&self) {}
}

pub fn caller() {
  let service: Service = Service::new();
  service.run();
  let _value = Service { value: 1 };
}
`
    });

    const symbols = facts.symbols.filter((symbol) => symbol.kind !== "file");
    expect(symbols.map((symbol) => symbol.qualifiedName)).toEqual(
      expect.arrayContaining([
        "src/service.rs#Service",
        "src/service.rs#Service::new",
        "src/service.rs#Service::run"
      ])
    );
    expect(facts.rustProjectFacts?.types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Service", typeKind: "struct" })
      ])
    );
    expect(facts.rustProjectFacts?.impls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selfTypeName: "Service", traitName: "Worker" })
      ])
    );
    expect(facts.rustProjectFacts?.impls?.some(
      (implementation) => implementation.selfTypeName === "Service" && implementation.traitName === undefined
    )).toBe(true);
    expect(facts.rustProjectFacts?.methodCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receiverName: "service",
          receiverTypeName: "Service",
          methodName: "run",
          callKind: "method"
        }),
        expect.objectContaining({
          receiverTypeName: "Service",
          methodName: "new",
          callKind: "associated-function"
        })
      ])
    );
    expect(facts.rustProjectFacts?.instantiations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ typeName: "Service", instantiationKind: "struct" })
      ])
    );
  });

  it("keeps trait-object dispatch, generic receivers, closures, and cfg items outside exact facts", () => {
    const facts = extractRustFileFacts({
      filePath: "src/negative.rs",
      language: "rust",
      sourceText: `
pub trait Worker { fn run(&self); }
pub struct Service;
impl Worker for Service { fn run(&self) {} }
pub fn caller(worker: &dyn Worker, service: Service) {
  worker.run();
  let callback = || service.run();
  callback();
}
#[cfg(feature = "special")]
pub struct Conditional;
`
    });

    expect(facts.rustProjectFacts?.methodCalls ?? []).toEqual([]);
    expect(facts.rustProjectFacts?.types ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Conditional" })])
    );
  });

  it("taints a concrete receiver after local alias escape", () => {
    const facts = extractRustFileFacts({
      filePath: "src/escape.rs",
      language: "rust",
      sourceText: `
struct Service;
impl Service { fn run(&self) {} }
fn caller(service: &Service) {
  let alias = service;
  alias.run();
  service.run();
}
`
    });

    expect(facts.rustProjectFacts?.methodCalls ?? []).toEqual([]);
  });
});
