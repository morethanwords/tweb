/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '../../slider';
import AppSelectPeers from '../../appSelectPeers';
import {setButtonLoader} from '../../putPreloader';
import {LangPackKey, _i18n} from '../../../lib/langPack';
import ButtonCorner from '../../buttonCorner';
import {providedTabs} from './solidJsTabs';

export default class AppAddMembersTab extends SliderSuperTab {
  private nextBtn: HTMLButtonElement;
  private selector: AppSelectPeers;
  private peerType: 'channel' | 'chat' | 'privacy';
  private takeOut: (peerIds: PeerId[]) => Promise<any> | false | void;
  private skippable: boolean;

  public init(options: {
    title: LangPackKey,
    placeholder: LangPackKey,
    type: AppAddMembersTab['peerType'],
    takeOut?: AppAddMembersTab['takeOut'],
    skippable: boolean,
    selectedPeerIds?: PeerId[]
  }) {
    this.container.classList.add('add-members-container');
    this.nextBtn = ButtonCorner({icon: 'arrow_next'});
    this.content.append(this.nextBtn);
    this.scrollable.container.remove();

    this.nextBtn.addEventListener('click', () => {
      const peerIds = this.selector.getSelected().map((sel) => sel.toPeerId());
      const result = this.takeOut(peerIds);

      if(this.skippable && !(result instanceof Promise)) {
        this.close();
      } else if(result instanceof Promise) {
        this.attachToPromise(result);
      } else if(result === undefined) {
        this.close();
      }
    });

    //
    this.setTitle(options.title);
    this.peerType = options.type;
    this.takeOut = options.takeOut;
    this.skippable = options.skippable;

    const isPrivacy = this.peerType === 'privacy';
    this.selector = new AppSelectPeers({
      middleware: this.middlewareHelper.get(),
      appendTo: this.content,
      onChange: this.skippable ? null : (length) => {
        this.nextBtn.classList.toggle('is-visible', !!length);
      },
      peerType: [isPrivacy ? 'dialogs' : 'contacts'],
      placeholder: options.placeholder,
      exceptSelf: isPrivacy,
      filterPeerTypeBy: isPrivacy ? ['isAnyGroup', 'isUser'] : undefined,
      managers: this.managers,
      design: 'square'
    });

    if(options.selectedPeerIds) {
      this.selector.addInitial(options.selectedPeerIds);
    }

    this.nextBtn.disabled = false;
    this.nextBtn.classList.toggle('is-visible', this.skippable);
  }

  public attachToPromise(promise: Promise<any>) {
    const removeLoader = setButtonLoader(this.nextBtn, 'arrow_next');

    promise.then(() => {
      this.close();
    }, () => {
      removeLoader();
    });
  }
}

providedTabs.AppAddMembersTab = AppAddMembersTab;
