/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../helpers/dom/clickEvent';
import ListenerSetter from '../helpers/listenerSetter';
import {LangPackKey, i18n} from '../lib/langPack';
import ButtonIcon from './buttonIcon';
import ConnectionStatusComponent from './connectionStatus';
import Icon from './icon';
import InputField from './inputField';
import ProgressivePreloader from './preloader';
import SetTransition from './singleTransition';

export default class InputSearch {
  public container: HTMLElement;
  public input: HTMLElement;
  public inputField: InputField;
  public clearBtn: HTMLElement;
  public searchIcon: HTMLElement;

  public prevValue = '';
  public timeout = 0;
  public onChange: (value: string) => void;
  public onClear: (e?: MouseEvent, wasEmpty?: boolean) => void;
  public onDebounce: (start: boolean) => void;

  private statusPreloader: ProgressivePreloader;
  private currentLangPackKey: LangPackKey;
  public currentPlaceholder: HTMLElement;

  private listenerSetter: ListenerSetter;
  private debounceTime: number;

  constructor(options: {
    placeholder?: LangPackKey,
    onChange?: (value: string) => void,
    onClear?: InputSearch['onClear'],
    onFocusChange?: (isFocused: boolean) => void,
    onDebounce?: (start: boolean) => void,
    alwaysShowClear?: boolean,
    noBorder?: boolean,
    noFocusEffect?: boolean,
    debounceTime?: number
  } = {}) {
    this.inputField = new InputField({
      // placeholder,
      plainText: true,
      withBorder: !options.noBorder
    });

    this.listenerSetter = new ListenerSetter();
    this.container = this.inputField.container;
    this.container.classList.remove('input-field');
    this.container.classList.add('input-search');

    this.onChange = options.onChange;
    this.onClear = options.onClear;
    this.onDebounce = options.onDebounce;
    this.debounceTime = options.debounceTime ?? 300;

    const input = this.input = this.inputField.input;
    input.classList.add('input-search-input');

    if(!options.noFocusEffect) {
      input.classList.add('with-focus-effect');
    }

    const searchIcon = this.searchIcon = this.createIcon('search', 'input-search-icon');
    const clearBtn = this.clearBtn = this.createButtonIcon('close', 'input-search-clear');
    clearBtn.classList.toggle('always-visible', !!options.alwaysShowClear);

    this.listenerSetter.add(input)('input', this.onInput);
    attachClickEvent(clearBtn, this.onClearClick, {listenerSetter: this.listenerSetter, cancelMouseDown: true});

    if(options.placeholder) {
      (input as HTMLInputElement).placeholder = ' ';
      this.setPlaceholder(options.placeholder);
    }

    if(options.onFocusChange) {
      this.listenerSetter.add(input)('focusin', () => {
        options.onFocusChange?.(true);
      });

      this.listenerSetter.add(input)('focusout', () => {
        options.onFocusChange?.(false);
      });
    }

    this.container.append(searchIcon, clearBtn);
  }

  public createButtonIcon(icon: Icon, ...args: string[]) {
    args ??= [];
    args.push('input-search-part', 'input-search-button');
    return ButtonIcon(icon + ' ' + args.join(' '), {noRipple: true});
  }

  public createIcon(icon: Icon, ...args: string[]) {
    return Icon(icon, 'input-search-part', ...args);
  }

  public isLoading() {
    return this.container.classList.contains('is-connecting');
  }

  public toggleLoading(loading: boolean) {
    if(!this.statusPreloader) {
      this.statusPreloader = new ProgressivePreloader({cancelable: false});
      this.statusPreloader.constructContainer({color: 'transparent', bold: true});
      this.statusPreloader.construct?.();
      this.statusPreloader.preloader.classList.add('is-visible', 'will-animate');
      this.searchIcon.classList.add('will-animate');
    }

    if(loading && !this.statusPreloader.preloader.parentElement) {
      this.container.append(this.statusPreloader.preloader);
    }

    this.statusPreloader.preloader.classList.toggle('is-hiding', !loading);
    this.searchIcon.classList.toggle('is-hiding', loading);
    SetTransition({
      element: this.container,
      className: 'is-connecting',
      forwards: loading,
      duration: ConnectionStatusComponent.ANIMATION_DURATION,
      onTransitionEnd: loading ? undefined : () => {
        this.statusPreloader.preloader.remove();
      }
      // useRafs: this.statusPreloader.preloader.isConnected ? 0 : 2
    });
  }

  public setPlaceholder = (langPackKey: LangPackKey, args?: any[]) => {
    if(this.currentLangPackKey === langPackKey) return;
    this.currentLangPackKey = langPackKey;

    const oldPlaceholder = this.currentPlaceholder;
    if(oldPlaceholder) {
      SetTransition({
        element: oldPlaceholder,
        className: 'is-hiding',
        forwards: true,
        duration: ConnectionStatusComponent.ANIMATION_DURATION,
        onTransitionEnd: () => {
          oldPlaceholder.remove();
        }
      });
    }

    this.currentPlaceholder = i18n(langPackKey, args);
    this.currentPlaceholder.classList.add('input-search-placeholder', 'will-animate');
    this.container.append(this.currentPlaceholder);
  };

  onInput = () => {
    if(!this.onChange) return;

    const value = this.value;

    if(value !== this.prevValue) {
      this.prevValue = value;
      this.clearTimeout(true);
      this.timeout = window.setTimeout(() => {
        this.onDebounce?.(false);
        this.onChange(value);
      }, this.debounceTime);
    }
  };

  onClearClick = (e?: MouseEvent) => {
    const isEmpty = this.inputField.isEmpty();
    this.value = '';
    this.onChange?.('');
    this.onClear?.(e, isEmpty);
  };

  clearTimeout = (debounceStart: boolean) => {
    clearTimeout(this.timeout);
    this.onDebounce?.(debounceStart);
  };

  get value() {
    return this.inputField.value;
  }

  set value(value: string) {
    this.prevValue = value;
    this.clearTimeout(false);
    this.inputField.value = value;
  }

  public remove() {
    this.clearTimeout(false);
    this.listenerSetter.removeAll();
  }
}
