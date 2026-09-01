import I18n, {LangPackKey} from '@lib/langPack';
import highlightText from '@helpers/dom/textHighlight';
import contextMenuController from '@helpers/contextMenuController';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import {getMiddleware, Middleware} from '@helpers/middleware';
import type Scrollable from '@components/scrollable';
import type SliderSuperTab from '@components/sliderTab';

const HIGHLIGHT_CLASS = 'is-settings-highlighted';
const HIGHLIGHT_DURATION = 1600;
/** Rows behind a manager round-trip (privacy values, sessions) render late. */
const WAIT_TIMEOUT = 3000;
/** A control is flashed whole, the way tdesktop flashes a settings button. */
const ANCHOR_SELECTOR = '.row, .checkbox-field, .radio-field, .btn-menu-item';

/**
 * Finds the element rendering `key`. Every `i18n()` label registers itself in
 * `I18n.weakMap`, so the lookup is by language key rather than by text — it keeps
 * working in any language and needs no markers in the settings tabs themselves.
 */
const findLabel = (container: HTMLElement, key: LangPackKey) => {
  for(const element of Array.from(container.querySelectorAll<HTMLElement>('.i18n'))) {
    if((I18n.weakMap.get(element) as I18n.IntlElement)?.key === key) return element;
  }
};

type HighlightOptions = {
  /** Where the label is looked for. */
  root: HTMLElement,
  /** Stops the flash when whatever owns the control goes away. */
  middleware?: Middleware,
  /** Scrolled to bring the control into view, when the control lives in one. */
  scrollable?: Scrollable
};

/**
 * Flashes the control rendering `key`, wherever it is: a row of a settings tab,
 * or an item of a menu that was opened for the occasion.
 */
/**
 * Runs `use` on the element rendering `key` — right away, or as soon as it is on
 * the screen: a row behind a manager round-trip renders after its tab is open.
 */
function onLabel(key: LangPackKey, options: HighlightOptions, use: (label: HTMLElement) => void) {
  const {root} = options;
  const middleware = options.middleware || getMiddleware().get();

  const found = findLabel(root, key);
  if(found) {
    use(found);
    return;
  }

  const observer = new MutationObserver(() => {
    const label = findLabel(root, key);
    if(!label && middleware()) return;

    observer.disconnect();
    clearTimeout(timeout);
    if(label) use(label);
  });

  observer.observe(root, {childList: true, subtree: true});
  const timeout = setTimeout(() => observer.disconnect(), WAIT_TIMEOUT);
  middleware.onClean(() => {
    observer.disconnect();
    clearTimeout(timeout);
  });
}

/**
 * Flashes the control rendering `key`, wherever it is: a row of a settings tab,
 * or an item of a menu that was opened for the occasion.
 */
export function highlightControl(key: LangPackKey, options: HighlightOptions) {
  const {scrollable} = options;
  const middleware = options.middleware || getMiddleware().get();

  onLabel(key, options, (label) => {
    if(!middleware()) return;

    const row = label.closest(ANCHOR_SELECTOR) as HTMLElement;
    const target = row || label;

    // only a control inside a scrollable is scrolled to; a menu is already on screen
    if(scrollable?.container.contains(target)) {
      scrollable.scrollIntoViewNew({element: target, position: 'center'});
    }

    if(row) {
      row.classList.add(HIGHLIGHT_CLASS);
      const fade = setTimeout(() => row.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION);
      middleware.onClean(() => clearTimeout(fade));
      return;
    }

    // A section header has no control to flash — paint its text instead, through
    // the same helper the found-message and quote highlights use.
    const painted = highlightText({container: label, match: {type: 'quote', text: label.textContent}});
    const fade = setTimeout(() => painted.fadeOut(), HIGHLIGHT_DURATION);
    middleware.onClean(() => {
      clearTimeout(fade);
      painted.dispose();
    });
  });
}

/**
 * Puts the caret in the field labelled `key` — what a link naming a field
 * (`tg://settings/edit/bio`) does once the screen carrying it is open. Pointing
 * at an input is typing in it, so it is a caret rather than a flash.
 */
export function focusControl(key: LangPackKey, options: HighlightOptions) {
  const middleware = options.middleware || getMiddleware().get();

  onLabel(key, options, (label) => {
    const input = label.closest('.input-field')?.querySelector<HTMLElement>('.input-field-input');
    if(input && middleware()) {
      placeCaretAtEnd(input);
    }
  });
}

/**
 * Opens the menu behind `toggle` (unless it already is) and flashes the item
 * rendering `key` — how a control that lives in a menu is pointed at, the way
 * tdesktop's `ShowLogOutMenu` shows the menu before highlighting the item in it.
 */
export function highlightMenuControl(toggle: HTMLElement, key: LangPackKey) {
  if(!toggle) {
    return;
  }

  if(!toggle.classList.contains('menu-open')) {
    // the pointer is nowhere near it, so it must survive the first move
    contextMenuController.keepNextOpenOnMouseMove();
    simulateClickEvent(toggle);
  }

  // the menu is appended to the body, and only once it has opened
  highlightControl(key, {root: document.body});
}

/** The same, for a control that belongs to a settings tab. */
export function highlightSettingsEntry(tab: SliderSuperTab, key: LangPackKey, root = tab.container) {
  return highlightControl(key, {
    root,
    middleware: tab.middlewareHelper.get(),
    scrollable: tab.scrollable
  });
}
