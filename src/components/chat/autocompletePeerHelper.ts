/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {Middleware} from '../../helpers/middleware';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {avatarNew} from '../avatarNew';
import PeerTitle from '../peerTitle';
import Scrollable from '../scrollable';
import AutocompleteHelper from './autocompleteHelper';
import AutocompleteHelperController from './autocompleteHelperController';

export default class AutocompletePeerHelper extends AutocompleteHelper {
  protected static BASE_CLASS = 'autocomplete-peer-helper';
  protected static BASE_CLASS_LIST_ELEMENT = AutocompletePeerHelper.BASE_CLASS + '-list-element';
  private scrollable: Scrollable;

  constructor(
    appendTo: HTMLElement,
    controller: AutocompleteHelperController,
    protected className: string,
    onSelect: (target: Element) => boolean | void
  ) {
    super({
      appendTo,
      controller,
      listType: 'y',
      onSelect
    });

    this.container.classList.add(AutocompletePeerHelper.BASE_CLASS, className);
  }

  public init() {
    this.list = document.createElement('div');
    this.list.classList.add(AutocompletePeerHelper.BASE_CLASS + '-list', this.className + '-list');

    this.container.append(this.list);

    this.scrollable = new Scrollable(this.container);

    this.addEventListener('visible', () => {
      setTimeout(() => { // it is not rendered yet
        this.scrollable.scrollPosition = 0;
      }, 0);
    });
  }

  public render(
    data: {peerId: PeerId, name?: string, description?: string}[],
    middleware: Middleware,
    doNotShow?: boolean
  ) {
    if(this.init) {
      if(!data.length) {
        return;
      }

      this.init();
      this.init = null;
    }

    if(data.length) {
      this.list.replaceChildren();
      data.forEach((d) => {
        const div = AutocompletePeerHelper.listElement({
          className: this.className,
          peerId: d.peerId,
          name: d.name,
          description: d.description,
          middleware
        });

        this.list.append(div);
      });
    }

    if(!doNotShow) {
      this.toggle(!data.length);
    }
  }

  public static listElement(options: {
    className: string,
    peerId: PeerId,
    name?: string,
    description?: string,
    middleware: Middleware
  }) {
    const BASE = AutocompletePeerHelper.BASE_CLASS_LIST_ELEMENT;
    options.className += '-list-element';

    const div = document.createElement('div');
    div.classList.add(BASE, options.className);
    div.dataset.peerId = '' + options.peerId;

    const {node} = avatarNew({
      middleware: options.middleware,
      isBig: false,
      size: 30,
      peerId: options.peerId
    });
    node.classList.add(BASE + '-avatar', options.className + '-avatar');

    const name = document.createElement('div');
    name.classList.add(BASE + '-name', options.className + '-name');
    if(!options.name) {
      name.append(new PeerTitle({
        peerId: options.peerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false
      }).element);
    } else {
      setInnerHTML(name, wrapEmojiText(options.name));
    }

    div.append(node, name);

    if(options.description) {
      const description = document.createElement('div');
      description.classList.add(BASE + '-description', options.className + '-description');
      setInnerHTML(description, wrapEmojiText(options.description));
      div.append(description);
    }

    return div;
  }
}
