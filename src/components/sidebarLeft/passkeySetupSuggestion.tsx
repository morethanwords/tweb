import showPasskeyPopup from '@components/popups/passkey';
import type {PendingSuggestionController} from '@components/sidebarLeft/pendingSuggestionController';
import {SimpleSuggestion} from '@components/sidebarLeft/pendingSuggestionItem';
import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import {usePendingSuggestions} from '@stores/promo';

const PASSKEY_SETUP_KEY = 'SETUP_PASSKEY';

function PasskeySetupSuggestion() {
  const emoji = () => wrapEmojiText('🔑');

  const onDismissed = () => {
    rootScope.managers.appPromoManager.dismissSuggestion(PASSKEY_SETUP_KEY);
  };

  const onClick = () => {
    showPasskeyPopup(() => {
      rootScope.managers.appPromoManager.dismissSuggestion(PASSKEY_SETUP_KEY);
    });
  };

  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.PasskeySetup', [emoji()])}
      subtitle={i18n('Suggestion.PasskeySetup.Subtitle')}
      onClick={onClick}
      onClose={onDismissed}
    />
  );
}

export default function createPasskeySetupSuggestion(): PendingSuggestionController {
  const pendingSuggestions = usePendingSuggestions();

  return {
    available: () => IS_WEB_AUTHN_SUPPORTED && pendingSuggestions().has(PASSKEY_SETUP_KEY),
    component: PasskeySetupSuggestion
  };
}
