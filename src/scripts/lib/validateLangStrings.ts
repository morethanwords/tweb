// The texts I18n.superFormatter would render wrong. It hands the arguments out in a fixed way: an explicit
// %N$ / unN slot takes argument N, a bare slot the next one after the highest explicit index, and a link
// with no address of its own takes the next one for its anchor before the slots in its label.
const SLOTS_AND_LINKS = /\[(.+?)\]\((.*?)\)|un\d|%\d\$.|%\S/g;

// * the arguments a text shows numbers in
function getCountedArgumentIndexes(input: string) {
  const explicit = input.match(/(%|un)\d+/g);
  let nextIndex = explicit?.length ? Math.max(...explicit.map((slot) => +slot.replace(/\D/g, ''))) : 0;
  const indexes: number[] = [];
  const walk = (text: string) => text.replace(SLOTS_AND_LINKS, (slot, label: string, target: string) => {
    if(label !== undefined) {
      if(!target || target.startsWith('%')) nextIndex++;
      walk(label);
    } else {
      const index = slot.replace(/\D/g, '');
      const argumentIndex = index ? +index - 1 : nextIndex++;
      if(slot.endsWith('d')) indexes.push(argumentIndex);
    }

    return '';
  });

  walk(input);
  return indexes;
}

// * I18n.format picks the plural form from argument 1, so a counted text has to show its count there
function countsElsewhere(input: string) {
  const indexes = getCountedArgumentIndexes(input);
  return indexes.length && !indexes.includes(0);
}

// * a link whose address is a placeholder ("[x](%1$@)") gets no anchor: superFormatter takes the anchor from
// * the next bare argument, which the placeholder's own index has pushed past the one passed for it
function hasPlaceholderLink(input: string) {
  return /\]\(%/.test(input);
}

export function getInvalidLangKeys(strings: Record<string, unknown>) {
  return Object.entries(strings).filter(([, value]) => {
    if(typeof(value) === 'string') return hasPlaceholderLink(value);
    if(!value || typeof(value) !== 'object') return false;

    return Object.values(value).some((input) => {
      return typeof(input) === 'string' && (countsElsewhere(input) || hasPlaceholderLink(input));
    });
  }).map(([key]) => key);
}
