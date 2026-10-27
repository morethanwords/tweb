vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@components/popups/premium', () => ({default: {show: vi.fn()}}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

import type {AppManagers} from '@lib/managers';
import type confirmationPopup from '@components/confirmationPopup';
import lang from '@/lang';
import getRichMessagePostingChoice from '@components/chat/inputEditor/richMessagePostingChoice';

function makeManagers(state: {allowed: boolean, available: boolean, mode: 'disabled' | 'enabled' | 'premium'}) {
  return {
    appMessagesManager: {
      getRichMessagePostingState: vi.fn().mockResolvedValue(state)
    }
  } as unknown as AppManagers;
}

function makeDependencies(confirm = vi.fn().mockResolvedValue(undefined)) {
  return {
    confirm: confirm as unknown as typeof confirmationPopup,
    showError: vi.fn(),
    showPremium: vi.fn()
  };
}

describe('rich message posting choice', () => {
  test('builds the Premium confirmation with a close button and two footer actions, Premium first', async() => {
    const dependencies = makeDependencies();
    const choice = await getRichMessagePostingChoice(makeManagers({
      allowed: false,
      available: true,
      mode: 'premium'
    }), dependencies);

    expect(choice).toBe('plain');
    expect(dependencies.confirm).toHaveBeenCalledOnce();
    const options = vi.mocked(dependencies.confirm).mock.calls[0][0];
    expect(options).toMatchObject({
      titleLangKey: 'RichMessage.PremiumRequired.Title',
      descriptionLangKey: 'RichMessage.PremiumRequired.Text',
      closable: true,
      footer: true,
      button: {langKey: 'RichMessage.RemoveFormatting', isSecondary: true},
      buttons: [
        {langKey: 'RichMessage.SubscribeToPremium', isCancel: true},
        {langKey: 'RichMessage.RemoveFormatting', isSecondary: true}
      ]
    });
    expect(options.buttons[1]).toBe(options.button);

    options.buttons[0].callback(new MouseEvent('click'));
    expect(dependencies.showPremium).toHaveBeenCalledOnce();
    expect(lang['RichMessage.PremiumRequired.Title']).toBe('Remove Formatting?');
    expect(lang['RichMessage.PremiumRequired.Text']).toBe(
      'This message uses rich formatting, which requires Telegram Premium.'
    );
    expect(lang['RichMessage.SubscribeToPremium']).toBe('Subscribe to Premium');
    expect(lang['RichMessage.RemoveFormatting']).toBe('Remove Formatting');
  });

  test('keeps the rich message when posting is allowed', async() => {
    const dependencies = makeDependencies();
    const choice = await getRichMessagePostingChoice(makeManagers({
      allowed: true,
      available: true,
      mode: 'enabled'
    }), dependencies);

    expect(choice).toBe('rich');
    expect(dependencies.confirm).not.toHaveBeenCalled();
  });

  test('returns cancel when the confirmation is closed', async() => {
    const dependencies = makeDependencies(vi.fn().mockRejectedValue('closed'));
    const choice = await getRichMessagePostingChoice(makeManagers({
      allowed: false,
      available: true,
      mode: 'premium'
    }), dependencies);

    expect(choice).toBe('cancel');
  });

  test('offers removing the formatting in a footer when the rollout is disabled', async() => {
    const dependencies = makeDependencies();
    const choice = await getRichMessagePostingChoice(makeManagers({
      allowed: false,
      available: false,
      mode: 'disabled'
    }), dependencies);

    expect(choice).toBe('plain');
    expect(dependencies.confirm).toHaveBeenCalledWith({
      titleLangKey: 'RichMessage.Unavailable.Title',
      descriptionLangKey: 'RichMessage.Unavailable.Text',
      footer: true,
      button: {langKey: 'RichMessage.RemoveFormatting'},
      cancelButton: {langKey: 'Cancel', isSecondary: true}
    });
  });
});
