export function add(left: number, right: number): number {
  return left + right;
}

export class Calculator {
  increment(value: number): number {
    return add(value, 1);
  }
}
