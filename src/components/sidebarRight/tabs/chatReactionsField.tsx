import {createEffect, createSignal, on, onCleanup} from 'solid-js';
import type {MessageEntity, Reaction} from '@layer';
import type {ReadingManagers} from '@lib/managers';
import {I18n} from '@lib/langPack';
import Modes from '@config/modes';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import attachPlainMessageEditor from '@components/chat/inputEditor/plainField';
import {getMessageEntityForEmojiWithDocId} from '@lib/richTextProcessor/getMessageEntityFromDocIdOrEmoji';
import parseEntities from '@lib/richTextProcessor/parseEntities';
import {PAID_REACTION_EMOJI_DOCID} from '@lib/customEmoji/constants';
import {PickedEmoji, ChatReactionsCatalogItem, reactionToDocId, PAID_PLAIN_EMOJI} from '@components/sidebarRight/tabs/chatReactionsState';
import styles from '@components/sidebarRight/tabs/chatReactionsField.module.scss';

// * what a custom emoji is written as in the text until its own emoji is known, and Stars always
const CUSTOM_EMOJI_ALT = '🙂';
// * the size of the old chips; the emoji are drawn at it (a bigger box than the renderer's would blur them)
const EMOJI_SIZE = 24;

export type ChatReactionsFieldApi = {
  /** Where a reaction picked goes, among the field's reactions (Stars included): the selection's end */
  getCaret: () => number,
  /** Where the caret stands once the field shows the list it is given next */
  setNextCaret: (index: number) => void
};

type FieldValue = {text: string, entities: MessageEntity.messageEntityCustomEmoji[], sizes: number[]};

function getCustomEmojiEntities(entities: MessageEntity[]) {
  return entities.filter((entity): entity is MessageEntity.messageEntityCustomEmoji => entity._ === 'messageEntityCustomEmoji');
}

/**
 * The ordered reactions of a channel as a line of emoji (as tdesktop's field): a field on the composer's
 * engine, so the caret, the selection, the clipboard, a drop and undo are an input's own. Whatever an
 * edit leaves in it is handed to `onEdit`, which says what of it is reactions; the field then shows
 * that list. Every reaction is a custom emoji in it: a standard one its select animation (with its emoji
 * as the text), custom ones their own, Stars a sentinel; a standard one without an animation is its emoji.
 */
export default function ChatReactionsField(props: {
  managers: ReadingManagers,
  // in the field's order: Stars first, when on
  reactions: Reaction[],
  // a standard reaction is drawn as its select animation, found here
  catalog: ChatReactionsCatalogItem[],
  pickerOpen: boolean,
  // a save in flight: nothing changes it meanwhile
  disabled?: boolean,
  // the text after an edit, as tokens, and the token the caret stands before; answers the caret's place in the list it makes
  onEdit: (tokens: PickedEmoji[], caret: number) => number,
  // whether typed text would become a reaction; anything else is refused before it replaces the selection
  canType: (data: string) => boolean,
  onOpenPicker: () => void,
  ref?: (api: ChatReactionsFieldApi) => void,
  inputRef?: (el: HTMLElement) => void
}) {
  const inputField = new InputField({placeholder: 'ReactionAddReactionsHint', withLinebreaks: false});
  const {container, input} = inputField;
  input.classList.add(styles.field);
  input.dataset.drawsCustomEmoji = '';
  input.dataset.customEmojiSize = '' + EMOJI_SIZE;
  input.style.setProperty('--messages-custom-emoji-size', EMOJI_SIZE + 'px');
  input.dataset.animationGroup = 'GENERAL-SETTINGS';
  // * named as its section, the hint is its description
  input.removeAttribute('aria-labelledby');
  input.setAttribute('aria-label', I18n.format('AvailableReactions', true));
  if(inputField.placeholder) input.setAttribute('aria-describedby', inputField.placeholder.id);

  // * the emoji a custom one is written as, as its document or a paste says
  const alts = new Map<DocId, string>();
  const [altsVersion, setAltsVersion] = createSignal(0);

  const buildValue = (reactions: Reaction[]): FieldValue => {
    const value: FieldValue = {text: '', entities: [], sizes: []};
    for(const reaction of reactions) {
      const docId = reactionToDocId(reaction, props.catalog);
      if(!docId) {
        const emoticon = (reaction as Reaction.reactionEmoji).emoticon;
        value.text += emoticon;
        value.sizes.push(emoticon.length);
        continue;
      }

      const alt = reaction._ === 'reactionPaid' ? PAID_PLAIN_EMOJI :
        (reaction._ === 'reactionEmoji' ? reaction.emoticon : alts.get(docId) || CUSTOM_EMOJI_ALT);
      value.entities.push({...getMessageEntityForEmojiWithDocId({docId, emoji: alt}), offset: value.text.length} as MessageEntity.messageEntityCustomEmoji);
      value.text += alt;
      // * an atom in the document
      value.sizes.push(1);
    }

    return value;
  };

  /** The document as tokens: an emoji, a custom emoji, or a run of anything else; and where each starts */
  const readTokens = () => {
    const tokens: PickedEmoji[] = [];
    const starts: number[] = [];
    const push = (token: PickedEmoji, start: number) => {
      tokens.push(token);
      starts.push(start);
    };

    let position = 0;
    for(const block of editor.getDocument().content || []) {
      ++position;
      for(const node of block.content || []) {
        if(node.type === 'customEmoji') {
          const docId = '' + node.attrs.documentId as DocId;
          // * a standard reaction's animation is that reaction, as its emoji is
          const standard = props.catalog.find((item) => item.docId === docId);
          push(standard ? {emoji: standard.emoticon} : {docId, emoji: node.attrs.emoji}, position++);
        } else if(node.type === 'text') {
          const {text} = node;
          let last = 0;
          for(const entity of parseEntities(text)) {
            if(entity._ !== 'messageEntityEmoji') continue;
            if(entity.offset > last) push({}, position + last);
            push({emoji: text.slice(entity.offset, entity.offset + entity.length)}, position + entity.offset);
            last = entity.offset + entity.length;
          }

          if(last < text.length) push({}, position + last);
          position += text.length;
        } else {
          push({}, position++);
        }
      }

      ++position;
    }

    return {tokens, starts};
  };

  const getTokenIndex = (starts: number[], position: number) => {
    let index = 0;
    while(index < starts.length && starts[index] < position) ++index;
    return index;
  };

  const getCaret = () => getTokenIndex(readTokens().starts, editor.captureSelection().to);

  /** Whether the document is `value` */
  const isShowing = (value: FieldValue) => {
    const current = editor.getRichValue(true, false);
    const entities = getCustomEmojiEntities(current.entities);
    return current.value === value.text &&
      entities.length === value.entities.length &&
      entities.every((entity, i) => entity.offset === value.entities[i].offset && entity.document_id === value.entities[i].document_id);
  };

  /** Shows `props.reactions`, if the field does not already, with the caret before the `caret`-th */
  const render = (caret: number, keepSelection?: boolean) => {
    const value = buildValue(props.reactions);
    if(isShowing(value)) {
      return;
    }

    // * the selection in reactions, not positions: the alts' lengths may differ in the new document
    let kept: {from: number, to: number, backward?: true};
    if(keepSelection) {
      const selection = editor.captureSelection();
      const {starts} = readTokens();
      kept = {
        from: getTokenIndex(starts, selection.from),
        to: getTokenIndex(starts, selection.to),
        ...(selection.backward && {backward: true as const})
      };
    }

    inputField.setValueSilently({text: value.text, entities: value.entities});
    const positionOf = (index: number) => 1 + value.sizes.slice(0, Math.max(0, index)).reduce((sum, size) => sum + size, 0);
    if(kept) {
      editor.restoreSelection({from: positionOf(kept.from), to: positionOf(kept.to), ...(kept.backward && {backward: true as const})}, false);
      return;
    }

    const position = positionOf(caret);
    editor.restoreSelection({from: position, to: position}, false);
  };

  let editing = false;
  let nextCaret: number;
  const onStateChange = () => {
    if(editor.isComposing || editing) {
      return;
    }

    inputField.syncFromInput();
    const {tokens, starts} = readTokens();
    let altsChanged = false;
    for(const token of tokens) {
      if(token.docId && token.docId !== PAID_REACTION_EMOJI_DOCID && token.emoji && token.emoji !== CUSTOM_EMOJI_ALT && !alts.has(token.docId)) {
        alts.set(token.docId, token.emoji);
        altsChanged = true;
      }
    }

    if(!altsChanged && isShowing(buildValue(props.reactions))) {
      return;
    }

    editing = true;
    let caret: number;
    try {
      caret = props.onEdit(tokens, getTokenIndex(starts, editor.captureSelection().to));
    } finally {
      editing = false;
    }

    render(caret);
  };

  const editor = attachPlainMessageEditor(input, {onStateChange});
  onCleanup(() => editor.destroy());

  // * typing that is no reaction is refused before it replaces the selection (a letter over all the reactions
  // * would empty the field); a composition cannot be cancelled, its result is filtered once it ends
  input.addEventListener('beforeinput', (e) => {
    if((e.inputType === 'insertText' || e.inputType === 'insertReplacementText') && e.data && !props.canType(e.data)) {
      e.preventDefault();
    }
  }, true);
  // * the editor inserts a typed character from `keypress` itself, over a whole-document selection too
  input.addEventListener('keypress', (e) => {
    if(e.charCode >= 32 && !e.ctrlKey && !e.metaKey && !props.canType(String.fromCodePoint(e.charCode))) {
      e.preventDefault();
    }
  }, true);
  input.addEventListener('compositionend', () => queueMicrotask(onStateChange));

  // * a list changed from outside (the picker, the paid switch): the caret where asked, or where it stood
  createEffect(on(() => [props.reactions, props.catalog, altsVersion()], () => {
    if(editing) {
      return;
    }

    const keepSelection = nextCaret === undefined;
    const caret = nextCaret ?? Math.min(getCaret(), props.reactions.length);
    nextCaret = undefined;
    render(caret, keepSelection);
  }));

  // * the custom emoji's own emoji, for the text a copy takes and for a screen reader
  createEffect(() => {
    const missing = props.reactions
    .filter((reaction): reaction is Reaction.reactionCustomEmoji => reaction._ === 'reactionCustomEmoji' && !alts.has(reaction.document_id))
    .map((reaction) => reaction.document_id);
    if(!missing.length) {
      return;
    }

    props.managers.appEmojiManager.getCustomEmojiDocuments(missing).then((docs) => {
      let changed = false;
      docs.forEach((doc) => {
        if(doc?.stickerEmojiRaw && !alts.has(doc.id)) {
          alts.set(doc.id, doc.stickerEmojiRaw);
          changed = true;
        }
      });

      if(changed) setAltsVersion((version) => version + 1);
    }, (err) => console.error('chat reactions: custom emoji', err));
  });

  createEffect(() => {
    editor.setEditable(!props.disabled);
    if(props.disabled) input.setAttribute('aria-disabled', 'true');
    else input.removeAttribute('aria-disabled');
  });

  createEffect(() => input.classList.toggle(styles.focused, props.pickerOpen));

  // * Stars are a sentinel and a standard reaction's animation is no real custom emoji: out of the field
  // * they are their plain character
  const isPlainOut = (docId: string) => docId === PAID_REACTION_EMOJI_DOCID || props.catalog.some((item) => item.docId === docId);
  const writePlain = (data: DataTransfer | null) => {
    const html = data?.getData('text/html');
    if(!html?.includes('data-doc-id')) {
      return;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    let changed = false;
    doc.querySelectorAll('[data-doc-id]').forEach((el) => {
      if(!isPlainOut(el.getAttribute('data-doc-id'))) return;
      el.replaceWith(el.getAttribute('data-sticker-emoji') || el.getAttribute('alt') || el.textContent);
      changed = true;
    });

    if(changed) data.setData('text/html', doc.body.innerHTML);
  };
  const onCopy = (e: ClipboardEvent) => writePlain(e.clipboardData);
  const onDragStart = (e: DragEvent) => writePlain(e.dataTransfer);

  // * a field's keys stay in it, as an input's do — the chat's composer takes what is typed anywhere else
  // * (and Enter there sends). Tab and Escape go on. The picker's button too, which keeps the focus after a
  // * click: Enter there opens the picker, not the composer's send
  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key === 'Tab' || e.key === 'Escape') {
      return;
    }

    e.stopPropagation();
    // * the field is one line however it wraps: Home and End go to its ends (the browser stops at each
    // * emoji's image there, as at the edge of a line)
    if(e.target === input && (e.key === 'Home' || e.key === 'End') && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const selection = editor.captureSelection();
      const anchor = selection.backward ? selection.to : selection.from;
      const head = e.key === 'Home' ? 1 : 1 + buildValue(props.reactions).sizes.reduce((sum, size) => sum + size, 0);
      const from = e.shiftKey ? Math.min(anchor, head) : head;
      const to = e.shiftKey ? Math.max(anchor, head) : head;
      editor.restoreSelection({from, to, ...(e.shiftKey && head < anchor && {backward: true as const})}, false);
      return;
    }

    // * the picker opens by its button; from the field with the keyboard layer
    if(e.target === input && e.key === 'Enter' && !e.isComposing && !editor.isComposing && Modes.a11y && !props.disabled) {
      e.preventDefault();
      props.onOpenPicker();
    }
  };

  props.inputRef?.(input);
  props.ref?.({
    getCaret,
    setNextCaret: (index) => nextCaret = index
  });

  return (
    <div class={styles.wrap} on:keydown={onKeyDown} on:copy={onCopy} on:cut={onCopy} on:dragstart={onDragStart}>
      {container}
      <Button.Icon
        icon="smile"
        class={styles.button}
        aria-label={I18n.format('ReactionAddReactionsHint', true)}
        aria-expanded={props.pickerOpen}
        disabled={props.disabled}
        noRipple
        onClick={(e) => {
          e.stopPropagation();
          props.onOpenPicker();
        }}
      />
    </div>
  );
}
