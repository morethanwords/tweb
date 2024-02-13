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

  private statusPreloader: ProgressivePreloader;
  private currentLangPackKey: LangPackKey;
  private currentPlaceholder: HTMLElement;

  private listenerSetter: ListenerSetter;

  constructor(options: {
    placeholder?: LangPackKey,
    onChange?: (value: string) => void,
    onClear?: InputSearch['onClear'],
    onFocusChange?: (isFocused: boolean) => void,
    alwaysShowClear?: boolean,
    noBorder?: boolean
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

    const input = this.input = this.inputField.input;
    input.classList.add('input-search-input');

    const searchIcon = this.searchIcon = Icon('search', 'input-search-icon', 'input-search-part');
    const clearBtn = this.clearBtn = ButtonIcon('close input-search-clear input-search-part', {noRipple: true});
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
      clearTimeout(this.timeout);
      this.timeout = window.setTimeout(() => {
        this.onChange(value);
      }, 300);
    }
  };

  onClearClick = (e?: MouseEvent) => {
    const isEmpty = this.inputField.isEmpty();
    this.value = '';
    this.onChange?.('');
    this.onClear?.(e, isEmpty);
  };

  get value() {
    return this.inputField.value;
  }

  set value(value: string) {
    this.prevValue = value;
    clearTimeout(this.timeout);
    this.inputField.value = value;
  }

  public remove() {
    clearTimeout(this.timeout);
    this.listenerSetter.removeAll();
  }
}
