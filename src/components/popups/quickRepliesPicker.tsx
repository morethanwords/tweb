import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {createMemo, createResource, createSignal, For, Show, untrack, useContext} from 'solid-js';
import InputField from '@components/inputField';
import Row from '@components/rowTsx';
import Scrollable from '@components/scrollable2';
import classNames from '@helpers/string/classNames';
import {i18n} from '@lib/langPack';
import {QuickReply} from '@lib/quickReplies/types';
import styles from './quickRepliesPicker.module.scss';

type PickerItem = QuickReply & {source?: 'crm', crmTemplateId?: number, imageCount?: number};

export default function showQuickRepliesPickerPopup(options: {
  onSelect: (reply: PickerItem) => void
}): void {
  function Inner() {
    const context = useContext(PopupContext);
    const managers = untrack(() => context.managers);

    const [items] = createResource(async(): Promise<PickerItem[]> => {
      const [local, templates, faqs] = await Promise.all([
        managers.appQuickRepliesManager.getQuickReplies(),
        managers.appCrmManager.getTemplates(),
        managers.appCrmManager.getFaqs()
      ]);

      const crm: PickerItem[] = [
        ...templates.map((t) => ({
          id: 'crm-t-' + t.id,
          title: t.name,
          text: t.text,
          date: 0,
          source: 'crm' as const,
          crmTemplateId: t.id,
          imageCount: t.image_urls?.length || 0
        })),
        ...faqs.map((f) => ({id: 'crm-f-' + f.id, title: f.question, text: f.answer, date: 0, source: 'crm' as const}))
      ];

      return [...local, ...crm];
    });

    const [query, setQuery] = createSignal('');

    const searchInputField = new InputField({
      label: 'Search',
      name: 'quick-replies-search',
      plainText: true
    });
    searchInputField.input.addEventListener('input', () => setQuery(searchInputField.value.trim().toLowerCase()));

    const filtered = createMemo(() => {
      const list = items() || [];
      const q = query();
      if(!q) return list;
      return list.filter((reply) => {
        return reply.title.toLowerCase().includes(q) || reply.text.toLowerCase().includes(q);
      });
    });

    const select = (reply: PickerItem) => {
      options.onSelect(reply);
      context.hide();
    };

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="QuickReplies.PickerTitle" />
        </PopupElement.Header>
        <PopupElement.Body class={styles.body}>
          <div class={styles.search}>{searchInputField.container}</div>
          <Show
            when={(items() || []).length}
            fallback={<div class={styles.empty}>{i18n('QuickReplies.EmptyHint')}</div>}
          >
            <Scrollable class={styles.list}>
              <For each={filtered()} fallback={<div class={styles.empty}>{i18n('QuickReplies.NoMatches')}</div>}>
                {(reply) => (
                  <Row clickable={() => select(reply)} class={styles.row}>
                    <Row.Title>
                      {reply.title}
                      <Show when={reply.source === 'crm'}>
                        <span class={styles.badge}>{i18n('QuickReplies.SourceCrm')}</span>
                      </Show>
                      <Show when={reply.imageCount}>
                        <span class={styles.images}>{(reply.imageCount > 1 ? reply.imageCount + ' ' : '') + '🖼'}</span>
                      </Show>
                    </Row.Title>
                    <Row.Subtitle>{reply.text}</Row.Subtitle>
                  </Row>
                )}
              </For>
            </Scrollable>
          </Show>
        </PopupElement.Body>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class={classNames('popup-quick-replies-picker', styles.popup)}
      closable
      old
    >
      <Inner />
    </PopupElement>
  ));
}
