/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import setInnerHTML from '../../helpers/dom/setInnerHTML';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import AvatarElement from '../avatar';
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
        this.scrollable.container.scrollTop = 0;
      }, 0);
    });
  }

  public render(data: {peerId: PeerId, name?: string, description?: string}[], doNotShow?: boolean) {
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
          description: d.description
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
    description?: string
  }) {
    const BASE = AutocompletePeerHelper.BASE_CLASS_LIST_ELEMENT;
    options.className += '-list-element';

    const div = document.createElement('div');
    div.classList.add(BASE, options.className);
    div.dataset.peerId = '' + options.peerId;

    const avatar = new AvatarElement();
    avatar.classList.add('avatar-30', BASE + '-avatar', options.className + '-avatar');
    avatar.updateWithOptions({
      isDialog: false,
      peerId: options.peerId
    });

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

    div.append(avatar, name);

    if(options.description) {
      const description = document.createElement('div');
      description.classList.add(BASE + '-description', options.className + '-description');
      setInnerHTML(description, wrapEmojiText(options.description));
      div.append(description);
    }

    return div;
  }
}
