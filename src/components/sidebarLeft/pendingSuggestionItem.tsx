import Button from '@components/buttonTsx';
import RippleElement from '@components/rippleElement';
import Row from '@components/rowTsx';
import styles from '@components/sidebarLeft/pendingSuggestion.module.scss';
import cancelEvent from '@helpers/dom/cancelEvent';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import classNames from '@helpers/string/classNames';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import {JSX, Show} from 'solid-js';

export const PendingSuggestion = (props: Parameters<typeof Row>[0] & {closable?: () => void}) => {
  return (
    <Row
      {...props}
      class={classNames(styles.suggestion, props.class)}
    >
      {props.children}
      {props.closable && (
        <Button.Icon
          icon="close"
          class={styles.close}
          onClick={(e) => {
            cancelEvent(e);
            props.closable();
          }}
        />
      )}
    </Row>
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

export function SimpleSuggestion(props: {
  emoji: string | (() => DocumentFragment),
  title: JSX.Element,
  subtitle: JSX.Element,
  danger?: boolean,
  onClick: () => void,
  onClose?: () => void
}) {
  const [isSidebarCollapsed] = useIsSidebarCollapsed();
  const emoji = typeof(props.emoji) === 'string' ? () => wrapEmojiText(props.emoji as string) : props.emoji;

  return (
    <Show
      when={isSidebarCollapsed()}
      fallback={
        <PendingSuggestion
          class={props.danger ? styles.danger : styles.secondary}
          clickable={props.onClick}
          closable={props.onClose}
          color={props.danger ? 'danger' : undefined}
        >
          <PendingSuggestion.Title>{props.title}</PendingSuggestion.Title>
          <PendingSuggestion.Subtitle>{props.subtitle}</PendingSuggestion.Subtitle>
        </PendingSuggestion>
      }
    >
      <RippleElement
        component="div"
        class={classNames(styles.collapsed, props.danger ? 'hover-danger-effect' : 'hover-effect')}
        onClick={props.onClick}
      >
        {documentFragmentToNodes(emoji())}
      </RippleElement>
    </Show>
  );
}
