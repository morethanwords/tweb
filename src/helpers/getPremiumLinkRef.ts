const DEFAULT_REF = 'tme_getpremium';
// a source names itself in a-z, 0-9 and _, up to 32 characters; anything else is dropped
const REF_REG_EXP = /^[a-z0-9_]{1,32}$/i;

/**
 * The `ref` t.me/GetPremium hands on to the Premium offer, the one its tg://premium_offer
 * counterpart carries: `?ref=Twitter` is `tme_getpremium_twitter`, and a missing or invalid one
 * leaves the plain `tme_getpremium`.
 */
export default function getPremiumLinkRef(ref?: string) {
  return ref && REF_REG_EXP.test(ref) ? DEFAULT_REF + '_' + ref.toLowerCase() : DEFAULT_REF;
}
