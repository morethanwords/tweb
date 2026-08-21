// `2n`-style literals need a higher target than this project compiles to, hence the calls.
const ZERO = BigInt(0);
const MASK = (BigInt(1) << BigInt(64)) - BigInt(1);
const SHIFT_21 = BigInt(21);
const SHIFT_35 = BigInt(35);
const SHIFT_4 = BigInt(4);

/**
 * Telegram's `hash` for list-returning methods: folds a vector of int64 ids into the value the
 * server compares against to answer with a `*NotModified` constructor. Mirrors `Api::CountHash`
 * (tdesktop `api/api_hash.h`) — the fold is over uint64, so every step is masked back into range.
 *
 * The result is returned unsigned; `storeLong` normalizes it before serializing.
 */
export default function countHash(values: (Long | number)[]) {
  let hash = ZERO;
  for(const value of values) {
    hash ^= hash >> SHIFT_21;
    hash ^= (hash << SHIFT_35) & MASK;
    hash ^= hash >> SHIFT_4;
    hash = (hash + BigInt(value)) & MASK;
  }

  return hash.toString();
}
