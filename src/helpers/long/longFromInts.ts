import bigInt from "big-integer";
import intToUint from "../number/intToUint";

export default function longFromInts(high: number, low: number): string {
  high = intToUint(high), low = intToUint(low);
  return bigInt(high).shiftLeft(32).add(bigInt(low)).toString(10);
}
