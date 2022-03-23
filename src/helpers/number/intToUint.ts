export default function intToUint(val: number) {
  // return val < 0 ? val + 4294967296 : val; // 0 <= val <= Infinity
  return val >>> 0; // (4294967296 >>> 0) === 0; 0 <= val <= 4294967295
}
