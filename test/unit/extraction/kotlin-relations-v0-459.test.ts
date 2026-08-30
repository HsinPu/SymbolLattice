import { describe, expect, it } from "vitest";

import { extractKotlinFileFacts } from "../../../src/extraction/kotlin.js";

describe("Kotlin v0.459 relation facts", () => {
  it("retains class, object, interface, enum, typealias, extension, calls, and constructors", () => {
    const facts = extractKotlinFileFacts({
      filePath: "src/relations.kt",
      language: "kotlin",
      sourceText: `package demo

interface Contract { fun act() }
open class Base
class Service(val value: Int) : Base(), Contract {
  override fun act() {}
  fun run() {}
}
object Singleton { fun ping() {} }
enum class Color { RED, BLUE }
typealias Alias = Service
fun Service.ext() {}
fun helper() {}
fun caller(value: Service) {
  val local: Service = Service(1)
  local.run()
  local.ext()
  Singleton.ping()
  helper()
}
`
    });

    expect(facts.kotlinFacts?.types).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Service", declarationKind: "class", constructorParameterCount: 1 }),
      expect.objectContaining({ name: "Singleton", declarationKind: "object" }),
      expect.objectContaining({ name: "Contract", declarationKind: "interface" }),
      expect.objectContaining({ name: "Color", declarationKind: "enum", variantNames: ["RED", "BLUE"] }),
      expect.objectContaining({ name: "Alias", declarationKind: "typealias", aliasTargetName: "Service" })
    ]));
    expect(facts.kotlinFacts?.callables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "ext", callableKind: "extension", receiverTypeName: "Service" }),
      expect.objectContaining({ name: "run", callableKind: "method", ownerTypeName: "Service" })
    ]));
    expect(facts.kotlinFacts?.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceName: "run", callKind: "member", receiverTypeName: "Service" }),
      expect.objectContaining({ referenceName: "ext", callKind: "member", receiverTypeName: "Service" }),
      expect.objectContaining({ referenceName: "ping", callKind: "member", receiverTypeName: "Singleton" }),
      expect.objectContaining({ referenceName: "helper", callKind: "direct" })
    ]));
    expect(facts.kotlinFacts?.instantiations).toEqual([
      expect.objectContaining({ typeName: "Service", argumentCount: 1 })
    ]);
  });

  it("fails closed for overload/default, optional, generic, alias, and escaped receivers", () => {
    const facts = extractKotlinFileFacts({
      filePath: "src/negative.kt",
      language: "kotlin",
      sourceText: `package demo

interface Contract { fun run() }
class Service : Contract { override fun run() {} }
class Other { fun run() {} }
class Secondary {
  constructor(value: Int) {}
}
fun overloaded() {}
fun overloaded(value: Int = 0) {}
fun caller(service: Service, contract: Contract, optional: Service?) {
  var mutable: Service = service
  mutable = service
  mutable.run()
  service?.run()
  contract.run()
  overloaded()
  fun nested() { service.run() }
  val callback = { service.run() }
  returnService(service)
}
fun returnService(service: Service) {}
fun shadow(service: Service) {
  if (true) {
    val service: Other = Other()
    service.run()
  }
  service.run()
}
fun secondary() { Secondary() }
`
    });

    expect(facts.kotlinFacts?.calls ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referenceName: "run", receiverName: "mutable" }),
        expect.objectContaining({ referenceName: "run", receiverName: "optional" }),
        expect.objectContaining({ referenceName: "overloaded" })
      ])
    );
  });
});
