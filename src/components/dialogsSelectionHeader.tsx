import {createMemo, JSX} from 'solid-js';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {I18n, i18n, LangPackKey} from '@lib/langPack';

/**
 * The header the left sidebar wears while rows are being selected: what is held, and what can be
 * done with it. It is a `sidebar-header` of its own rather than something laid inside
 * the usual one, so it carries that header's own metrics and can simply be faded over it.
 */
export default function DialogsSelectionHeader(props: {
  count: number,
  /** what the count reads as - chats, topics or contacts */
  countLangKey: LangPackKey,
  onCancel: () => void,
  /**
   * Whether the count is laid out the way a header with rows lays out its title - smaller, the way
   * a forum tab titles itself. The bar stands in for a header, so it wears that header's own size.
   */
  compact?: boolean,
  /**
   * what the selection can take - a menu of actions, or the one action there is - built by the
   * selection, which knows what the rows it holds can take
   */
  actions: JSX.Element
}) {
  // the node carries the number in it, so it is rebuilt whenever the count changes
  const count = createMemo(() => i18n(props.countLangKey, [props.count]));
  const title = <div class="sidebar-header__title">{count()}</div>;

  return (
    <div class="sidebar-header chatlist-selection-header">
      <ButtonIconTsx
        class="close sidebar-close-button"
        icon="close"
        noRipple
        aria-label={I18n.format('Cancel', true)}
        onClick={() => props.onCancel()}
      />
      {props.compact ? <div class="sidebar-header__rows">{title}</div> : title}
      {props.actions}
    </div>
  );
}
