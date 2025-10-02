import {i18n} from '../../lib/langPack';
import {useAppState} from '../../stores/appState';
import Row from '../rowTsx';
import styles from './pendingSuggestion.module.scss';
import {render} from 'solid-js/web';
import {createEffect, createSignal, JSX, Show} from 'solid-js';
import classNames from '../../helpers/string/classNames';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {useIsSidebarCollapsed} from '../../stores/foldersSidebar';
import RippleElement from '../rippleElement';
import documentFragmentToNodes from '../../helpers/dom/documentFragmentToNodes';
import showFrozenPopup from '../popups/frozen';

const PendingSuggestion = (props: Parameters<typeof Row>[0]) =>{
  return (
    <Row
      {...props}
      class={classNames(styles.suggestion, props.class)}
    />
  );
};

PendingSuggestion.Title = (props: Parameters<typeof Row.Title>[0]) => {
  return (
    <Row.Title {...props}>
      <span class={classNames('text-bold', styles.suggestionTitle)}>{props.children}</span>
    </Row.Title>
  );
};

PendingSuggestion.Subtitle = (props: Parameters<typeof Row.Subtitle>[0]) => {
  return (
    <Row.Subtitle {...props}>
      <span class={styles.suggestionSubtitle}>{props.children}</span>
    </Row.Subtitle>
  );
};

function FrozenSuggestion() {
  const [isSidebarCollapsed] = useIsSidebarCollapsed();
  const emoji = () => wrapEmojiText('🚫');

  const onClick = () => {
    showFrozenPopup();
  };

  return (
    <Show
      when={isSidebarCollapsed()}
      fallback={
        <PendingSuggestion
          class={styles.danger}
          clickable={onClick}
          color="danger"
        >
          <PendingSuggestion.Title>{i18n('Suggestion.Frozen.Title', [emoji()])}</PendingSuggestion.Title>
          <PendingSuggestion.Subtitle>{i18n('Suggestion.Frozen.Subtitle')}</PendingSuggestion.Subtitle>
        </PendingSuggestion>
      }
    >
      <RippleElement
        component="div"
        class={classNames(styles.banned, 'hover-danger-effect')}
        onClick={onClick}
      >
        {documentFragmentToNodes(emoji())}
      </RippleElement>
    </Show>
  );
}

export function renderPendingSuggestion(toElement: HTMLElement) {
  toElement.classList.add(styles.container);

  render(() => {
    const [{appConfig}] = useAppState();
    const [element, setElement] = createSignal<JSX.Element>();

    if(appConfig.freeze_since_date) {
      setElement(FrozenSuggestion());
    }

    createEffect(() => {
      document.body.classList.toggle('has-pending-suggestion', !!element());
    });

    return (
      <>{element()}</>
    );
  }, toElement);
}
