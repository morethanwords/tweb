// I18n.format selects the plural form from args[0]. Match superFormatter's slot ordering:
// explicit %N$ / unN slots address N, and implicit slots start after the highest explicit index.
export function getInvalidPluralKeys(strings: Record<string, unknown>) {
  return Object.entries(strings).filter(([, value]) => {
    if(!value || typeof(value) !== 'object') return false;

    return Object.values(value).some((input) => {
      if(typeof(input) !== 'string') return false;

      const explicit = input.match(/(%|un)\d+/g);
      let nextIndex = explicit?.length ? Math.max(...explicit.map((slot) => +slot.replace(/\D/g, ''))) : 0;
      const indexes: number[] = [];
      for(const slot of input.match(/un\d|%\d\$.|%\S/g) || []) {
        const index = slot.replace(/\D/g, '');
        const argumentIndex = index ? +index - 1 : nextIndex++;
        if(slot.endsWith('d')) indexes.push(argumentIndex);
      }

      return indexes.length && !indexes.includes(0);
    });
  }).map(([key]) => key);
}
