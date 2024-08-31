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
  public backBtn: HTMLElement;

  public prevValue = '';
  public timeout = 0;
  public onChange: (value: string) => void;
  public onClear: (e?: MouseEvent, wasEmpty?: boolean) => void;
  public onDebounce: (start: boolean) => void;
  public onBack: () => void;

  private statusPreloader: ProgressivePreloader;
  private currentLangPackKey: LangPackKey;
  public currentPlaceholder: HTMLElement;

  private listenerSetter: ListenerSetter;
  private debounceTime: number;
  private verifyDebounce: (value: string, prevValue: string) => boolean;

  private alwaysShowClear: boolean;
  private arrowBack: boolean;

  constructor(options: {
    placeholder?: LangPackKey,
    onChange?: (value: string) => void,
    onClear?: InputSearch['onClear'],
    onFocusChange?: (isFocused: boolean) => void,
    onDebounce?: (start: boolean) => void,
    onBack?: () => void,
    alwaysShowClear?: boolean,
    noBorder?: boolean,
    noFocusEffect?: boolean,
    debounceTime?: number,
    verifyDebounce?: (value: string, prevValue: string) => boolean,
    arrowBack?: boolean,
    oldStyle?: boolean
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

    if(options.oldStyle) {
      this.container.classList.add('old-style');
    }

    this.onChange = options.onChange;
    this.onClear = options.onClear;
    this.onDebounce = options.onDebounce;
    this.onBack = options.onBack;
    this.debounceTime = options.debounceTime ?? 300;
    this.verifyDebounce = options.verifyDebounce;
    this.alwaysShowClear = options.alwaysShowClear;

    const input = this.input = this.inputField.input;
    input.classList.add('input-search-input');

    if(!options.noFocusEffect) {
      input.classList.add('with-focus-effect');
    }

    const searchIcon = this.searchIcon = this.createIcon('search', 'input-search-icon');
    const clearBtn = this.clearBtn = this.createButtonIcon('close', 'input-search-clear');

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

    this.setArrowBack(options.arrowBack);
  }

  public setArrowBack = (arrowBack: boolean) => {
    if(this.arrowBack === arrowBack) return;
    this.arrowBack = arrowBack;

    this.container.classList.toggle('with-arrow-back', arrowBack);

    if(arrowBack && !this.backBtn) {
      this.backBtn = this.createButtonIcon('arrow_prev', 'input-search-icon', 'input-search-back');
      this.container.append(this.backBtn);
      attachClickEvent(this.backBtn, this.onBack, {listenerSetter: this.listenerSetter, cancelMouseDown: true});
    }

    this.searchIcon.classList.toggle('hide', arrowBack);
    this.backBtn && this.backBtn.classList.toggle('hide', !arrowBack);
    this.clearBtn.classList.toggle('always-visible', !arrowBack && !!this.alwaysShowClear);
  };

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
    const another = this.arrowBack ? this.clearBtn : this.searchIcon;
    if(!this.statusPreloader) {
      this.statusPreloader = new ProgressivePreloader({cancelable: false});
      this.statusPreloader.constructContainer({color: 'transparent', bold: true});
      this.statusPreloader.construct?.();
      this.statusPreloader.preloader.classList.add('is-visible', 'will-animate');
      another.classList.add('will-animate');
    }

    if(loading && !this.statusPreloader.preloader.parentElement) {
      this.container.append(this.statusPreloader.preloader);
    }

    this.statusPreloader.preloader.classList.toggle('is-hiding', !loading);
    another.classList.toggle('is-hiding', loading || (another === this.clearBtn && this.inputField.isEmpty()));
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

    const {value, prevValue} = this;
    if(value === prevValue) {
      return;
    }

    this.prevValue = value;
    if(this.verifyDebounce?.(value, prevValue) === false) {
      this.clearTimeout(false);
      this.onChange(value);
      return;
    }

    this.clearTimeout(true);
    this.timeout = window.setTimeout(() => {
      this.onDebounce?.(false);
      this.onChange(value);
    }, this.debounceTime);
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
    this.verifyDebounce = undefined;
    this.listenerSetter.removeAll();
  }
}
