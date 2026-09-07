import lang from '@/lang';
import {getInvalidPluralKeys} from '@/scripts/lib/validatePluralStrings';

describe('plural strings', () => {
  test('spend their first argument on the count', () => {
    expect(getInvalidPluralKeys(lang)).toEqual([]);
  });

  test('rejects incompatible imported forms while accepting explicit and implicit count slots', () => {
    expect(getInvalidPluralKeys({
      reordered: {other_value: '%2$s sent %1$d gifts'},
      implicit: {one_value: '%d gift'},
      noCountSlot: {other_value: 'Gifts'},
      ordinary: '%s sent %d gifts',
      wrongExplicit: {other_value: '%1$s sent %2$d gifts'},
      wrongImplicit: {one_value: '%s sent %d gift', other_value: '%2$s sent %1$d gifts'},
      afterExplicit: {other_value: '%1$s sent %d gifts'}
    })).toEqual(['wrongExplicit', 'wrongImplicit', 'afterExplicit']);
  });
});
