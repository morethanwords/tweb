/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createMemo, createSignal, createUniqueId, For, Index, on, onCleanup, Show} from 'solid-js';
import I18n, {i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import shake from '@helpers/dom/shake';
import {getAppWindow} from '@helpers/appWindow';
import liteMode from '@helpers/liteMode';
import styles from '@components/wallet/screens/wordFields.module.scss';

/**
 * The numbered word fields of iOS's import and "Test Time" screens (WalletImportScreen): suggestions from the word
 * list in a bubble under the field being typed in, Space and Enter going on to the next field, Backspace in an empty
 * one going back, a word that is no word refusing to be left, a phrase pasted (or typed) at once spread over the
 * fields.
 */

/** the most suggestions a bubble holds (iOS) */
const SUGGESTIONS = 3;
/** suggestions start at this many letters (iOS) */
const SUGGEST_FROM = 2;

export function normalizeWalletWord(word: string) {
  return word.trim().toLowerCase();
}

const QUOTES = '"\'“”‘’«»';
const LEADING_FORMATTING = '•-–—*' + QUOTES;

function stripFormatting(token: string) {
  let start = 0;
  while(start < token.length && LEADING_FORMATTING.includes(token[start])) ++start;
  let end = token.length;
  while(end > start && QUOTES.includes(token[end - 1])) --end;
  return token.slice(start, end);
}

/**
 * The words of a pasted phrase (iOS: parseWalletPastedWords). Words split at whitespace, commas and semicolons;
 * bullets, dashes and quotes around them go, and so does a number before each — `1.`, `1)`, `1:`, `(1)`, `[1]` or a
 * lone `1`. A complete, unambiguous numbered list of 12 or 24 is put back in order: a phrase copied from two columns
 * may come row by row.
 */
export function parseWalletPastedWords(text: string): string[] {
  const words: {number?: number, word: string}[] = [];
  let pendingNumber: number;
  let hasExtraNumbers = false;
  for(const sourceToken of text.split(/[\s,;]+/)) {
    let token = stripFormatting(sourceToken);
    if(!token) {
      continue;
    }

    let numberToken = token;
    let closingBracket: string;
    if(numberToken[0] === '(' || numberToken[0] === '[') {
      closingBracket = numberToken[0] === '(' ? ')' : ']';
      numberToken = numberToken.slice(1);
    }

    const digits = numberToken.match(/^\d+/)?.[0];
    if(digits) {
      const suffix = numberToken.slice(digits.length);
      let wordAfterNumber: string;
      if(closingBracket) {
        if(suffix[0] === closingBracket) wordAfterNumber = suffix.slice(1);
      } else if(!suffix) {
        wordAfterNumber = suffix;
      } else if(suffix[0] === '.' || suffix[0] === ')' || suffix[0] === ':') {
        wordAfterNumber = suffix.slice(1);
      }

      if(wordAfterNumber !== undefined) {
        if(pendingNumber !== undefined) {
          hasExtraNumbers = true;
        }

        // * a number too long to read still counts as numbering, but cannot be sorted
        pendingNumber = +digits <= Number.MAX_SAFE_INTEGER ? +digits : 0;
        token = stripFormatting(wordAfterNumber);
      }
    }

    if(token) {
      words.push({number: pendingNumber, word: token.toLowerCase()});
      pendingNumber = undefined;
    }
  }

  if((words.length === 12 || words.length === 24) && !hasExtraNumbers && pendingNumber === undefined) {
    const numbers = new Set(words.map((item) => item.number));
    let complete = numbers.size === words.length;
    for(let i = 1; complete && i <= words.length; ++i) {
      complete = numbers.has(i);
    }

    if(complete) {
      words.sort((a, b) => a.number - b.number);
    }
  }

  return words.map((item) => item.word);
}

export type WalletWordFieldsHandle = {
  /** focuses a field, its word selected */
  focus: (index: number) => void,
  shake: (index: number) => void,
  blur: () => void
};

export default function WalletWordFields(props: {
  /** what each field is numbered: 1…n, or the quiz's words */
  numbers: number[],
  words: Accessor<string[]>,
  setWord: (index: number, word: string) => void,
  /** the word list; empty until it is in */
  wordlist: Accessor<ReadonlySet<string>>,
  /** fields a check found wrong: red, tinted */
  mismatched?: Accessor<ReadonlySet<number>>,
  disabled?: boolean,
  /** two columns, numbered down each */
  columns?: boolean,
  /** several words pasted, or typed, at once into field `index` */
  onWords: (index: number, words: string[]) => void,
  /** Enter in the last field, every word in */
  onSubmit: () => void,
  canSubmit: () => boolean,
  /** the Paste button in the first field, while it is shown */
  paste?: {shown: Accessor<boolean>, onClick: () => void},
  ref?: (handle: WalletWordFieldsHandle) => void
}) {
  const [active, setActive] = createSignal<number>();
  const inputs: HTMLInputElement[] = [];
  const fields: HTMLElement[] = [];
  let grid: HTMLDivElement, bubble: HTMLDivElement, invalidItem: HTMLElement;
  // * a field is being moved to by the screen itself: an invalid word left behind does not hold it
  let moving = false;

  const isInvalid = (index: number) => {
    const word = props.words()[index];
    const list = props.wordlist();
    return !!word && !!list.size && !list.has(word);
  };

  // * what the bubble under the active field holds (iOS: updateWordSuggestions)
  const suggestions = createMemo<{words: string[], invalid?: boolean, query: string}>(() => {
    const index = active();
    const word = index === undefined ? '' : props.words()[index] || '';
    const list = props.wordlist();
    if(word.length < SUGGEST_FROM || !list.size) {
      return;
    }

    const found: string[] = [];
    for(const item of list) {
      if(item.startsWith(word)) {
        found.push(item);
        if(found.length === SUGGESTIONS) break;
      }
    }

    if(!found.length && !list.has(word)) {
      return {words: [I18n.format('Wallet.Import.InvalidWord', true)], invalid: true, query: word};
    }

    if(found.length === 1 && found[0] === word) {
      return;
    }

    return found.length ? {words: found, query: word} : undefined;
  });

  // * the bubble keeps what it last held while it fades out
  const [shown, setShown] = createSignal<ReturnType<typeof suggestions>>();
  createEffect(() => {
    const value = suggestions();
    if(value) setShown(value);
  });

  // * the suggestion Enter, Space and Tab take: the first, or the one Up and Down moved to, as in the chat's
  // * suggestions and tdesktop's (Left and Right stay the caret's). A new list starts over at its first
  const [pick, setPick] = createSignal<{list: ReturnType<typeof suggestions>, index: number}>();
  const picked = () => {
    const value = pick();
    return value && value.list === shown() ? value.index : 0;
  };
  const pickedWord = () => suggestions()?.words[picked()];
  const listboxId = createUniqueId();
  const optionId = (index: number) => `${listboxId}-${index}`;

  const focus = (index: number, select = true) => {
    const input = inputs[index];
    if(!input) return;
    moving = true;
    input.focus();
    moving = false;
    if(select && input.value) input.select();
  };

  const pulse = () => {
    if(!liteMode.isAvailable('motion') || !invalidItem) return;
    invalidItem.animate([{transform: 'scale(1)'}, {transform: 'scale(1.04)'}, {transform: 'scale(1)'}], {duration: 200, easing: 'ease-in-out'});
  };

  // * a word that is no word does not let the focus go to another field (iOS: rejectInvalidWord)
  const reject = (index: number) => {
    shake(fields[index]);
    pulse();
  };

  const accept = (index: number, word: string, advance: boolean) => {
    props.setWord(index, word);
    if(inputs[index]) inputs[index].value = word;
    if(advance) advanceFrom(index);
  };

  const advanceFrom = (index: number) => {
    const word = normalizeWalletWord(inputs[index]?.value || '');
    if(!word) {
      shake(fields[index]);
      return;
    }

    if(isInvalid(index)) {
      reject(index);
      return;
    }

    if(index + 1 < props.numbers.length) {
      focus(index + 1);
    }
  };

  // * Enter (and Space, which never types into a word): the picked suggestion is taken, then the next field — or,
  // * in the last one with every word in, the screen's action
  const onReturn = (index: number, submit: boolean) => {
    const current = suggestions();
    if(active() === index && current && !current.invalid) {
      accept(index, pickedWord(), false);
    }

    if(submit && index === props.numbers.length - 1 && props.canSubmit()) {
      props.onSubmit();
    } else {
      advanceFrom(index);
    }
  };

  // * the form's own keys and its first field's focus are how it is typed into (iOS), for everyone: not part of the
  // * a11y layer, so not behind Modes.a11y
  const onKeyDown = (index: number, e: KeyboardEvent) => {
    if(e.isComposing) return;
    if(e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onReturn(index, e.key === 'Enter');
    } else if(e.key === 'Tab' && !e.shiftKey && suggestions() && !suggestions().invalid) {
      // * a word typed in full is taken and Tab goes on as Tab does — out of the last field too, never held in it
      if(pickedWord() === normalizeWalletWord(inputs[index].value)) {
        accept(index, pickedWord(), false);
        return;
      }

      e.preventDefault();
      accept(index, pickedWord(), true);
    } else if((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions()?.words.length > 1 && !suggestions().invalid) {
      e.preventDefault();
      const count = suggestions().words.length;
      setPick({list: suggestions(), index: (picked() + (e.key === 'ArrowDown' ? 1 : count - 1)) % count});
    } else if(e.key === 'Tab' && isInvalid(index)) {
      e.preventDefault();
      reject(index);
    } else if(e.key === 'Backspace' && !inputs[index].value && index > 0) {
      e.preventDefault();
      focus(index - 1);
    }
  };

  const onInput = (index: number, input: HTMLInputElement) => {
    const value = input.value;
    // * words typed at once (a keyboard's autocomplete, a drop): spread like a paste
    if(/[\s,;]/.test(value.trim())) {
      const words = parseWalletPastedWords(value);
      if(words.length > 1) {
        input.value = props.words()[index] || '';
        props.onWords(index, words);
        return;
      }
    }

    const word = normalizeWalletWord(value);
    // * a space typed past the key handler (a touch keyboard's): the next field, as Space does
    if(word && /\s$/.test(value)) {
      accept(index, word, true);
      return;
    }

    if(word !== value) input.value = word;
    const longer = word.length > (props.words()[index] || '').length;
    props.setWord(index, word);
    if(longer && suggestions()?.invalid) pulse();
  };

  const onPaste = (index: number, e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text/plain') || '';
    const words = parseWalletPastedWords(text);
    if(words.length === 1 && words[0] === normalizeWalletWord(text)) {
      return;
    }

    e.preventDefault();
    if(words.length > 1) props.onWords(index, words);
    else if(words.length) accept(index, words[0], false);
  };

  const onFocus = (index: number) => {
    setActive(index);
    // * a filled field is selected as it is entered: typing replaces the word (iOS)
    const input = inputs[index];
    if(input.value) setTimeout(() => input.ownerDocument.activeElement === input && input.select(), 0);
  };

  const onBlur = (index: number, e: FocusEvent) => {
    const to = e.relatedTarget as HTMLElement;
    if(!moving && to && inputs.includes(to as HTMLInputElement) && isInvalid(index)) {
      queueMicrotask(() => focus(index, false));
      reject(index);
      return;
    }

    if(active() === index) setActive(undefined);
  };

  // * the bubble under the active field, inside the grid: centred on the field, kept within the grid, its notch on
  // * the field's middle. One read of the sizes, then the writes.
  createEffect(on([active, shown], ([index]) => {
    if(index === undefined || !bubble || !fields[index]) return;
    const field = fields[index];
    const fieldLeft = field.offsetLeft, fieldWidth = field.offsetWidth, fieldBottom = field.offsetTop + field.offsetHeight;
    const width = bubble.offsetWidth, gridWidth = grid.clientWidth;
    const center = fieldLeft + fieldWidth / 2;
    const left = Math.max(0, Math.min(gridWidth - width, center - width / 2));
    bubble.style.left = left + 'px';
    bubble.style.top = fieldBottom + 'px';
    bubble.style.setProperty('--notch-offset', (center - left - 19 / 2) + 'px');
  }));

  props.ref?.({
    focus,
    shake: (index) => shake(fields[index]),
    blur: () => (getAppWindow().document.activeElement as HTMLElement)?.blur()
  });

  onCleanup(() => inputs.length = 0);

  const bubbleVisible = () => !!suggestions() && active() !== undefined;

  return (
    <div ref={grid} class={classNames(styles.grid, props.columns && styles.gridColumns, props.columns && props.numbers.length <= 12 && styles.gridShort)}>
      <Index each={props.numbers}>{(number, index) => (
        <label
          ref={(element) => fields[index] = element}
          class={styles.field}
          classList={{
            [styles.fieldFilled]: !!props.words()[index],
            [styles.fieldMismatched]: !!props.mismatched?.().has(index)
          }}
        >
          <span class={styles.number} aria-hidden="true">{number()}.</span>
          <input
            ref={(element) => inputs[index] = element}
            class={styles.input}
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            enterkeyhint={index === props.numbers.length - 1 ? 'done' : 'next'}
            disabled={props.disabled}
            aria-label={I18n.format('Wallet.Restore.Word', true, [number()])}
            aria-invalid={props.mismatched?.().has(index) || isInvalid(index) || undefined}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={active() === index && bubbleVisible() && !shown()?.invalid ? optionId(picked()) : undefined}
            value={props.words()[index] || ''}
            onInput={(e) => onInput(index, e.currentTarget)}
            onPaste={(e) => onPaste(index, e)}
            onKeyDown={(e) => onKeyDown(index, e)}
            onFocus={() => onFocus(index)}
            onBlur={(e) => onBlur(index, e)}
          />
          <Show when={index === 0 && props.paste?.shown()}>
            <button
              type="button"
              class={styles.paste}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.paste.onClick()}
            >
              {i18n('Wallet.Import.Paste')}
            </button>
          </Show>
        </label>
      )}</Index>
      <div
        ref={bubble}
        class={classNames('tooltip', 'tooltip-bottom', 'tooltip-lighter', 'is-visible', 'forwards', styles.bubble)}
        classList={{[styles.bubbleVisible]: bubbleVisible()}}
        aria-hidden={!bubbleVisible() || undefined}
      >
        <div class="tooltip-part tooltip-background" />
        <span class="tooltip-part tooltip-notch" />
        <div
          id={listboxId}
          class={classNames('tooltip-part', styles.items)}
          role={shown()?.invalid ? undefined : 'listbox'}
          aria-label={shown()?.invalid ? undefined : I18n.format('Wallet.Restore.Suggestions', true)}
        >
          <For each={shown()?.words}>{(word, index) => (
            <Show
              when={!shown().invalid}
              fallback={<span ref={invalidItem} class={classNames(styles.item, styles.itemInvalid)} role="alert">{word}</span>}
            >
              <button
                id={optionId(index())}
                type="button"
                class={styles.item}
                classList={{[styles.itemSelected]: index() === picked() && shown().words.length > 1}}
                role="option"
                aria-selected={index() === picked()}
                tabIndex={-1}
                // * the field keeps the focus: the word goes into it
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const field = active();
                  if(field !== undefined) accept(field, word, true);
                }}
              >
                <span class={styles.itemMatch}>{word.slice(0, shown().query.length)}</span>{word.slice(shown().query.length)}
              </button>
            </Show>
          )}</For>
        </div>
      </div>
    </div>
  );
}
