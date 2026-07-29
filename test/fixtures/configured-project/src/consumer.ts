import { add } from "@math";
import { formatTotal } from "@lib/format";

export function calculate(): string {
  return formatTotal(add(20, 22));
}
