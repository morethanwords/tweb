/**
 * Converts a number to uint32 using bitwise operations.
 * Note: This wraps values rather than clamping them.
 */
export default function intToUint(val: number) {
  return val >>> 0;
}
