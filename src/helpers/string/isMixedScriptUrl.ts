import convertPunycode from '../../vendor/convertPunycode';

// * https://github.com/Ajaxy/telegram-tt/blob/6b52024107b7b534fc25dfaddd91868f653d0092/src/util/browser/url.ts#L43
export default function isMixedScriptUrl(url: string): boolean {
  let domain;
  try {
    domain = convertPunycode(new URL(url).hostname);
  } catch(e) {
    return true; // If URL is invalid, treat it as mixed script
  }

  let hasLatin = false;
  let hasNonLatin = false;

  for(const char of Array.from(domain)) {
    if(!/\p{L}/u.test(char)) continue; // Ignore non-letter characters

    if(/\p{Script=Latin}/u.test(char)) {
      hasLatin = true;
    } else {
      hasNonLatin = true;
    }

    if(hasLatin && hasNonLatin) return true;
  }

  return false;
}
