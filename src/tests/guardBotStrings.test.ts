import I18n from '@lib/langPack';
import lang from '@/lang';

// the guard-bot strings mix positional arguments with a link slot, which superFormatter fills from a
// separate argument — a mismatch there would silently swap the chat and the bot in the disclaimer
describe('guard bot strings', () => {
  const render = (input: string, args: any[]) => {
    return I18n.superFormatter(input, args)
    .map((node) => typeof(node) === 'string' ? node : (node as HTMLElement).outerHTML ?? '')
    .join('');
  };

  test('names the chat, the bot and the terms link in the disclaimer', () => {
    const terms = document.createElement('a');
    terms.href = 'https://telegram.org/tos/mini-apps';

    const result = render(lang.WebAppGuardDisclaimerText, ['Cats Chat', 'Guard Bot', terms]);

    expect(result).toBe(
      '<b>Cats Chat</b> uses <b>Guard Bot</b> to welcome new members. ' +
      'You must agree to the <a href="https://telegram.org/tos/mini-apps">Terms of Use</a> of mini apps to continue.'
    );
  });

  test('keeps the current and the replacement bot in order', () => {
    expect(render(lang.GuardBotReplaceText, ['Old Bot', 'New Bot'])).toBe(
      '<b>Old Bot</b> is currently processing join requests. Switch to <b>New Bot</b> instead?'
    );
  });

  test('renders the managed-by link on the chat type screen', () => {
    const anchor = document.createElement('a');
    anchor.textContent = 'Guard Bot';

    expect(render(lang.GuardBotManagedBy, [anchor])).toBe('Managed by <a>Guard Bot</a>');
  });

  test('decides the join outcome wording without needing the chat title', () => {
    for(const key of [
      'GroupRequestApproved',
      'GroupRequestApprovedChannel',
      'GroupRequestDeclined',
      'GroupRequestDeclinedChannel',
      'GroupRequestSent',
      'GroupRequestSentChannel'
    ] as const) {
      expect(lang[key]).not.toMatch(/%|un\d/);
    }
  });
});
