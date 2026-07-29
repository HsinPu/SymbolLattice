import { add, Calculator } from "./math.js";

export function calculate(): number {
  const calculator = new Calculator();
  return add(calculator.increment(2), 3);
}
