import I18n from '@lib/langPack';
import lang from '@/lang';
import langSign from '@/langSign';
import {getInvalidLangKeys} from '@/scripts/lib/validateLangStrings';

describe('lang strings', () => {
  test('render the way the formatter hands out their arguments', () => {
    expect(getInvalidLangKeys({...lang, ...langSign})).toEqual([]);
  });

  test('reject a count out of argument 1 and a link whose address is a placeholder', () => {
    expect(getInvalidLangKeys({
      reordered: {other_value: '%2$s sent %1$d gifts'},
      implicit: {one_value: '%d gift'},
      noCountSlot: {other_value: 'Gifts'},
      ordinary: '%s sent %d gifts',
      linkAfterCount: {other_value: 'Get [Premium]() for %1$d channels'},
      wrongExplicit: {other_value: '%1$s sent %2$d gifts'},
      wrongImplicit: {one_value: '%s sent %d gift', other_value: '%2$s sent %1$d gifts'},
      afterExplicit: {other_value: '%1$s sent %d gifts'},
      afterLink: {other_value: 'Get [Premium]() for %d channels'},
      placeholderLink: 'Get it on [Fragment](%1$@)',
      ownAddress: 'Read the [terms](https://telegram.org/tos)'
    })).toEqual(['wrongExplicit', 'wrongImplicit', 'afterExplicit', 'afterLink', 'placeholderLink']);
  });

  // * a stored pack keeps the server's texts from before a reorder until its update arrives, and an open
  // * tab of the previous build gets the reordered ones: either way the link is handed a number
  test('render a link handed something other than an element as its label', () => {
    const render = (input: string, args: any[]) => I18n.superFormatter(input, args)
    .map((node) => typeof(node) === 'object' ? (node as Element).outerHTML ?? (node as Node).textContent : String(node))
    .join('');
    const before = 'Subscribe to [Telegram Premium]() to increase download speeds %d times.';
    const now = lang['Chat.DownloadLimit.Text'].other_value;

    expect(render(before, [10, document.createElement('a')])).toBe('Subscribe to Telegram Premium to increase download speeds <a></a> times.');
    expect(render(now, [document.createElement('a'), 10])).toBe('Subscribe to Telegram Premium to increase download speeds <a></a> times.');
    expect(render(now, [10, document.createElement('a')])).toBe('Subscribe to <a>Telegram Premium</a> to increase download speeds 10 times.');
  });
});
