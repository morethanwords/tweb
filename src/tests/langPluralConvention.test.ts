import lang from '@/lang';

// I18n.format picks the plural form from the first argument, so every counted text has to spend its
// first argument on the count — a text that leads with a name picks the form out of that name instead
describe('plural strings', () => {
  // * mirrors how superFormatter walks the slots: an explicit %N$ / unN takes the N-th argument,
  // * a bare slot takes the next one, starting after the highest explicit index
  const getCountedArgumentIndexes = (input: string) => {
    const explicit = input.match(/(%|un)\d+/g);
    let i = explicit?.length ? Math.max(...explicit.map((str) => +str.replace(/\D/g, ''))) : 0;

    const indexes: number[] = [];
    for(const slot of input.match(/un\d|%\d\$.|%\S/g) || []) {
      const index = slot.replace(/\D/g, '');
      const argumentIndex = index ? +index - 1 : i++;
      if(slot.endsWith('d')) {
        indexes.push(argumentIndex);
      }
    }

    return indexes;
  };

  test('spend their first argument on the count', () => {
    const leadingWithSomethingElse = Object.entries(lang).filter(([, value]) => {
      const input = (value as any)?.other_value;
      if(typeof(input) !== 'string') {
        return false;
      }

      const indexes = getCountedArgumentIndexes(input);
      return indexes.length && !indexes.includes(0);
    }).map(([key]) => key);

    expect(leadingWithSomethingElse).toEqual([]);
  });
});
