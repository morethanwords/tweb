import showFrozenPopup from '@components/popups/frozen';
import type {PendingSuggestionController} from '@components/sidebarLeft/pendingSuggestionController';
import {SimpleSuggestion} from '@components/sidebarLeft/pendingSuggestionItem';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {useAppState} from '@stores/appState';

function FrozenSuggestion() {
  const emoji = () => wrapEmojiText('🚫');
  const onClick = () => showFrozenPopup();

  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.Frozen.Title', [emoji()])}
      subtitle={i18n('Suggestion.Frozen.Subtitle')}
      onClick={onClick}
    />
  );
}

export default function createFrozenSuggestion(): PendingSuggestionController {
  const [{appConfig}] = useAppState();

  return {
    available: () => !!appConfig.freeze_since_date,
    component: FrozenSuggestion
  };
}
