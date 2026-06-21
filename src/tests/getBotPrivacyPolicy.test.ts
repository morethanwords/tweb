import {BotInfo} from '@layer';
import {BOT_DEFAULT_PRIVACY_POLICY_URL, botHasPrivacyCommand, resolveBotPrivacyPolicy} from '@helpers/getBotPrivacyPolicy';

function makeBotInfo(partial: Partial<BotInfo.botInfo> = {}): BotInfo.botInfo {
  return {
    _: 'botInfo',
    pFlags: {},
    ...partial
  };
}

const privacyCommand = {_: 'botCommand', command: 'privacy', description: 'Privacy policy'} as const;
const startCommand = {_: 'botCommand', command: 'start', description: 'Start'} as const;
const privacySettingsCommand = {_: 'botCommand', command: 'privacy_settings', description: 'Settings'} as const;

describe('getBotPrivacyPolicy', () => {
  test('default URL constant matches tdesktop/Android', () => {
    expect(BOT_DEFAULT_PRIVACY_POLICY_URL).toBe('https://telegram.org/privacy-tpa');
  });

  describe('botHasPrivacyCommand', () => {
    test('true only when a command.command === "privacy"', () => {
      expect(botHasPrivacyCommand(makeBotInfo({commands: [startCommand, privacyCommand]}))).toBe(true);
    });

    test('false for undefined commands array', () => {
      expect(botHasPrivacyCommand(makeBotInfo())).toBe(false);
    });

    test('false for empty commands array', () => {
      expect(botHasPrivacyCommand(makeBotInfo({commands: []}))).toBe(false);
    });

    test('exact string match, not "privacy_settings"', () => {
      expect(botHasPrivacyCommand(makeBotInfo({commands: [privacySettingsCommand]}))).toBe(false);
    });
  });

  describe('resolveBotPrivacyPolicy', () => {
    test('privacy_policy_url set -> returns {url}', () => {
      const url = 'https://example.com/policy';
      expect(resolveBotPrivacyPolicy(makeBotInfo({privacy_policy_url: url}))).toEqual({url});
    });

    test('url wins even when a /privacy command also exists', () => {
      const url = 'https://example.com/policy';
      const resolved = resolveBotPrivacyPolicy(makeBotInfo({privacy_policy_url: url, commands: [privacyCommand]}));
      expect(resolved).toEqual({url});
    });

    test('no url + has /privacy command -> {sendCommand: true}', () => {
      expect(resolveBotPrivacyPolicy(makeBotInfo({commands: [privacyCommand]}))).toEqual({sendCommand: true});
    });

    test('no url + no privacy command (empty) -> default URL', () => {
      expect(resolveBotPrivacyPolicy(makeBotInfo({commands: []}))).toEqual({url: BOT_DEFAULT_PRIVACY_POLICY_URL});
    });

    test('no url + no commands at all -> default URL', () => {
      expect(resolveBotPrivacyPolicy(makeBotInfo())).toEqual({url: BOT_DEFAULT_PRIVACY_POLICY_URL});
    });
  });
});
