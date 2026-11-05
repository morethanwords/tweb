/** Past the end and back (s = 1.70158), for `v` from 0 to 1 */
export default function easeOutBack(v: number) {
  const s = 1.70158;
  return (v - 1) * (v - 1) * ((s + 1) * (v - 1) + s) + 1;
}
