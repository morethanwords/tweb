// https://stackoverflow.com/a/14824756/6758968
// * neither the surrogates (an emoji's halves), the private use area (icon glyphs) nor the variation
// * selectors (an emoji's presentation) are letters: they decide no direction
const ltrChars  = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF'+'\u2C00-\uD7FF\uF900-\uFB1C\uFDFE-\uFDFF\uFE10-\uFE6F\uFEFD-\uFFFF',
  rtlChars      = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC',
  fullRtlDirCheck   = new RegExp('^[^'+ltrChars+']*['+rtlChars+']'),
  justRtlDirCheck   = new RegExp('['+rtlChars+']');

export default function isRTL(s: string, anyChar?: boolean) {
  return anyChar ? justRtlDirCheck.test(s) : fullRtlDirCheck.test(s);
}
