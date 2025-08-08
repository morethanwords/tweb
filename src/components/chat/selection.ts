/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MessagesStorageKey} from '../../lib/appManagers/appMessagesManager';
import type ChatBubbles from './bubbles';
import type ChatInput from './input';
import type Chat from './chat';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import Button from '../button';
import ButtonIcon from '../buttonIcon';
import CheckboxField from '../checkboxField';
import PopupDeleteMessages from '../popups/deleteMessages';
import PopupForward from '../popups/forward';
import SetTransition from '../singleTransition';
import ListenerSetter from '../../helpers/listenerSetter';
import PopupSendNow from '../popups/sendNow';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import {IS_MOBILE_SAFARI} from '../../environment/userAgent';
import {i18n, _i18n} from '../../lib/langPack';
import findUpClassName from '../../helpers/dom/findUpClassName';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import cancelEvent from '../../helpers/dom/cancelEvent';
import cancelSelection from '../../helpers/dom/cancelSelection';
import getSelectedText from '../../helpers/dom/getSelectedText';
import replaceContent from '../../helpers/dom/replaceContent';
import AppSearchSuper from '../appSearchSuper.';
import isInDOM from '../../helpers/dom/isInDOM';
import {randomLong} from '../../helpers/random';
import {attachClickEvent, AttachClickOptions} from '../../helpers/dom/clickEvent';
import findUpAsChild from '../../helpers/dom/findUpAsChild';
import EventListenerBase from '../../helpers/eventListenerBase';
import safeAssign from '../../helpers/object/safeAssign';
import {AppManagers} from '../../lib/appManagers/managers';
import {attachContextMenuListener} from '../../helpers/dom/attachContextMenuListener';
import appImManager from '../../lib/appManagers/appImManager';
import {Message} from '../../layer';
import PopupElement from '../popups';
import flatten from '../../helpers/array/flatten';
import IS_STANDALONE from '../../environment/standalone';
import {toastNew} from '../toast';
import confirmationPopup from '../confirmationPopup';
import {makeFullMid} from './bubbles';
import {ChatType} from './chat';

const accumulateMapSet = (map: Map<any, Set<number>>) => {
  return [...map.values()].reduce((acc, v) => acc + v.size, 0);
};

// const MIN_CLICK_MOVE = 32; // minimum bubble height

class AppSelection extends EventListenerBase<{
  toggle: (isSelecting: boolean) => void
}> {
  public selectedMids: Map<PeerId, Set<number>> = new Map();
  public isSelecting = false;

  public selectedText: string;

  protected listenerSetter: ListenerSetter;
  public isScheduled: boolean;
  public isStories: boolean;
  protected listenElement: HTMLElement;

  protected onToggleSelection: (forwards: boolean, animate: boolean) => void | Promise<void>;
  protected onUpdateContainer: (cantForward: boolean, cantDelete: boolean, cantSend: boolean, cantPin: boolean) => void;
  protected onCancelSelection: () => void;
  protected toggleByMid: (peerId: PeerId, mid: number) => void;
  protected toggleByElement: (bubble: HTMLElement) => void;

  protected navigationType: NavigationItem['type'];

  protected getElementFromTarget: (target: HTMLElement) => HTMLElement;
  protected verifyTarget: (e: MouseEvent, target: HTMLElement) => boolean;
  protected verifyMouseMoveTarget: (e: MouseEvent, element: HTMLElement, selecting: boolean) => boolean;
  protected verifyTouchLongPress: () => boolean;
  protected targetLookupClassName: string;
  protected lookupBetweenParentClassName: string;
  protected lookupBetweenElementsQuery: string;

  protected doNotAnimate: boolean;
  protected managers: AppManagers;

  protected onTouchLongPress: (e: Event) => void;

  constructor(options: {
    managers: AppManagers,
    getElementFromTarget: AppSelection['getElementFromTarget'],
    verifyTarget?: AppSelection['verifyTarget'],
    verifyMouseMoveTarget?: AppSelection['verifyMouseMoveTarget'],
    verifyTouchLongPress?: AppSelection['verifyTouchLongPress'],
    targetLookupClassName: string,
    lookupBetweenParentClassName: string,
    lookupBetweenElementsQuery: string,
    onTouchLongPress?: AppSelection['onTouchLongPress']
  }) {
    super(false);

    safeAssign(this, options);

    this.navigationType = 'multiselect-' + randomLong() as any;
  }

  public attachListeners(listenElement: HTMLElement, listenerSetter: ListenerSetter) {
    if(this.listenElement) {
      this.listenerSetter.removeAll();
    }

    this.listenElement = listenElement;
    this.listenerSetter = listenerSetter;

    if(!listenElement) {
      return;
    }

    if(IS_TOUCH_SUPPORTED) {
      listenerSetter.add(listenElement)('touchend', () => {
        if(!this.isSelecting) return;
        this.selectedText = getSelectedText();
      });

      attachContextMenuListener({
        element: listenElement,
        callback: (e) => {
          if(this.isSelecting || (this.verifyTouchLongPress && !this.verifyTouchLongPress())) return;

          this.onTouchLongPress?.(e);

          // * these two lines will fix instant text selection on iOS Safari
          document.body.classList.add('no-select'); // * need no-select on body because chat-input transforms in channels
          listenElement.addEventListener('touchend', (e) => {
            cancelEvent(e); // ! this one will fix propagation to document loader button, etc
            document.body.classList.remove('no-select');

            // this.chat.bubbles.onBubblesClick(e);
          }, {once: true, capture: true});

          if(IS_MOBILE_SAFARI && IS_STANDALONE) {
            listenElement.addEventListener('mousedown', cancelEvent, {once: true, capture: true});
          }

          cancelSelection();
          cancelEvent(e as any);
          const element = this.getElementFromTarget(e.target as HTMLElement);
          if(element) {
            this.toggleByElement(element);
          }
        },
        listenerSetter
      });

      return;
    }

    listenerSetter.add(listenElement)('mousedown', this.onMouseDown);
  }

  private onMouseDown = (e: MouseEvent) => {
    // console.log('selection mousedown', e);
    const element = findUpClassName(e.target, this.targetLookupClassName);
    if(e.button !== 0) {
      return;
    }

    if(this.verifyTarget && !this.verifyTarget(e, element)) {
      return;
    }

    const seen: AppSelection['selectedMids'] = new Map();
    let selecting: boolean;

    /* let good = false;
    const {x, y} = e; */

    /* const bubbles = appImManager.bubbles;
    for(const mid in bubbles) {
      const bubble = bubbles[mid];
      bubble.addEventListener('mouseover', () => {
        console.log('mouseover');
      }, {once: true});
    } */

    let firstTarget = element;

    const processElement = (element: HTMLElement, checkBetween = true) => {
      const mid = +element.dataset.mid;
      if(!mid || !element.dataset.peerId) return;
      const peerId = element.dataset.peerId.toPeerId();

      if(!isInDOM(firstTarget)) {
        firstTarget = element;
      }

      let seenSet = seen.get(peerId);
      if(!seenSet) {
        seen.set(peerId, seenSet = new Set());
      }

      if(seenSet.has(mid)) {
        return;
      }

      const isSelected = this.isMidSelected(peerId, mid);
      if(selecting === undefined) {
        // bubblesContainer.classList.add('no-select');
        selecting = !isSelected;
      }

      seenSet.add(mid);

      if((selecting && !isSelected) || (!selecting && isSelected)) {
        const seenLength = accumulateMapSet(seen);
        if(this.toggleByElement && checkBetween) {
          if(seenLength < 2) {
            if(findUpAsChild(element, firstTarget)) {
              firstTarget = element;
            }
          }

          const elementsBetween = this.getElementsBetween(firstTarget, element);
          // console.log(elementsBetween);
          if(elementsBetween.length) {
            elementsBetween.forEach((element) => {
              processElement(element, false);
            });
          }
        }

        if(!this.selectedMids.size) {
          if(seenLength === 2 && this.toggleByMid) {
            for(const [peerId, mids] of seen) {
              for(const mid of mids) {
                this.toggleByMid(peerId, mid);
              }
            }
          }
        } else if(this.toggleByElement) {
          this.toggleByElement(element);
        }
      }
    };

    // const foundTargets: Map<HTMLElement, true> = new Map();
    let canceledSelection = false;
    const onMouseMove = (e: MouseEvent) => {
      if(!canceledSelection) {
        cancelSelection();
        canceledSelection = true;
        document.body.classList.add('no-select');
        // const chat = document.querySelector('.chat');
        // chat.classList.add('no-select');
      }
      /* if(!good) {
        if(Math.abs(e.x - x) > MIN_CLICK_MOVE || Math.abs(e.y - y) > MIN_CLICK_MOVE) {
          good = true;
        } else {
          return;
        }
      } */

      /* if(foundTargets.has(e.target as HTMLElement)) return;
      foundTargets.set(e.target as HTMLElement, true); */
      const element = this.getElementFromTarget(e.target as HTMLElement);
      if(!element) {
        // console.error('found no bubble', e);
        return;
      }

      if(this.verifyMouseMoveTarget && !this.verifyMouseMoveTarget(e, element, selecting)) {
        this.listenerSetter.removeManual(this.listenElement, 'mousemove', onMouseMove);
        this.listenerSetter.removeManual(document, 'mouseup', onMouseUp, documentListenerOptions);
        return;
      }

      processElement(element);
    };

    const onMouseUp = (e: MouseEvent) => {
      document.body.classList.remove('no-select');

      if(seen.size) {
        attachClickEvent(window, cancelEvent, {capture: true, once: true, passive: false});
      }

      this.listenerSetter.removeManual(this.listenElement, 'mousemove', onMouseMove);
      // bubblesContainer.classList.remove('no-select');

      // ! CANCEL USER SELECTION !
      cancelSelection();
    };

    const documentListenerOptions = {once: true};
    this.listenerSetter.add(this.listenElement)('mousemove', onMouseMove);
    this.listenerSetter.add(document)('mouseup', onMouseUp, documentListenerOptions);
  };

  private getElementsBetween = (first: HTMLElement, last: HTMLElement) => {
    if(first === last) {
      return [];
    }

    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    const difference = (firstRect.top - lastRect.top) || (firstRect.left - lastRect.left);
    const isHigher = difference < 0;

    const parent = findUpClassName(first, this.lookupBetweenParentClassName);
    if(!parent) {
      return [];
    }

    const elements = Array.from(parent.querySelectorAll(this.lookupBetweenElementsQuery)) as HTMLElement[];
    let firstIndex = elements.indexOf(first);
    let lastIndex = elements.indexOf(last);

    if(!isHigher) {
      [lastIndex, firstIndex] = [firstIndex, lastIndex];
    }

    const slice = elements.slice(firstIndex + 1, lastIndex);

    // console.log('getElementsBetween', first, last, slice, firstIndex, lastIndex, isHigher);

    return slice;
  };

  protected isElementShouldBeSelected(element: HTMLElement) {
    return this.isMidSelected(element.dataset.peerId.toPeerId(), +element.dataset.mid);
  }

  protected appendCheckbox(element: HTMLElement, checkboxField: CheckboxField) {
    element.prepend(checkboxField.label);
  }

  public toggleElementCheckbox(element: HTMLElement, show: boolean) {
    const hasCheckbox = !!this.getCheckboxInputFromElement(element);
    if(show) {
      if(hasCheckbox) {
        return false;
      }

      const checkboxField = new CheckboxField({
        name: element.dataset.mid,
        round: true
      });

      // * if it is a render of new message
      if(this.isSelecting) { // ! avoid breaking animation on start
        if(this.isElementShouldBeSelected(element)) {
          checkboxField.input.checked = true;
          element.classList.add('is-selected');
        }
      }

      this.appendCheckbox(element, checkboxField);
    } else if(hasCheckbox) {
      this.getCheckboxInputFromElement(element).parentElement.remove();
      SetTransition({
        element,
        className: 'is-selected',
        forwards: false,
        duration: 200
      });
    }

    return true;
  }

  protected getCheckboxInputFromElement(element: HTMLElement): HTMLInputElement {
    return element.firstElementChild?.tagName === 'LABEL' &&
      element.firstElementChild.firstElementChild as HTMLInputElement;
  }

  protected async updateContainer(forceSelection = false) {
    const size = this.selectedMids.size;
    if(!size && !forceSelection) return;

    let cantForward = !size,
      cantDelete = !size,
      cantSend = !size,
      cantPin = !size;

    if(this.isStories) {
      cantForward = true;
      cantSend = true;
      const peerId = this.selectedMids.keys().next().value;
      const r = await this.managers.appStoriesManager.cantPinDeleteStories(peerId, Array.from(this.selectedMids.get(peerId)));
      cantPin = r.cantPin;
      cantDelete = r.cantDelete;
    } else for(const [peerId, mids] of this.selectedMids) {
      const storageKey = this.getStorageKey(peerId);
      const r = await this.managers.appMessagesManager.cantForwardDeleteMids(storageKey, Array.from(mids));
      cantForward = r.cantForward;
      cantDelete = r.cantDelete;

      if(cantForward && cantDelete) break;
    }

    this.onUpdateContainer?.(cantForward, cantDelete, cantSend, cantPin);
  }

  private getStorageKey(peerId: PeerId): MessagesStorageKey {
    return `${peerId}_${this.isScheduled ? 'scheduled' : 'history'}`;
  }

  public getSelectedMids() {
    return flatten([...this.selectedMids.values()].map((set) => [...set])).sort((a, b) => a - b);
  }

  public getSelectedMessages() {
    const selectedMessagesPromises: Promise<Message.message | Message.messageService>[] = [];
    this.selectedMids.forEach((mids, peerId) => {
      const storageKey = this.getStorageKey(peerId);
      const p = Array.from(mids).map((mid) => this.managers.appMessagesManager.getMessageFromStorage(storageKey, mid));
      selectedMessagesPromises.push(...p);
    });
    return Promise.all(selectedMessagesPromises);
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const wasSelecting = this.isSelecting;
    const size = this.selectedMids.size;
    this.isSelecting = !!size || forceSelection;

    if(wasSelecting === this.isSelecting) return false;

    this.dispatchEvent('toggle', this.isSelecting);

    // const bubblesContainer = this.bubbles.bubblesContainer;
    // bubblesContainer.classList.toggle('is-selecting', !!size);

    /* if(bubblesContainer.classList.contains('is-chat-input-hidden')) {
      const scrollable = this.appImManager.scrollable;
      if(scrollable.isScrolledDown) {
        scrollable.scrollTo(scrollable.scrollHeight, 'top', true, true, 200);
      }
    } */

    if(!IS_TOUCH_SUPPORTED) {
      this.listenElement.classList.toggle('no-select', this.isSelecting);

      if(wasSelecting) {
        // ! CANCEL USER SELECTION !
        cancelSelection();
      }
    }/*  else {
      if(!wasSelecting) {
        bubblesContainer.classList.add('no-select');
        setTimeout(() => {
          cancelSelection();
          bubblesContainer.classList.remove('no-select');
          cancelSelection();
        }, 100);
      }
    } */

    blurActiveElement();

    const forwards = !!size || forceSelection;
    const toggleResult = this.onToggleSelection?.(forwards, !this.doNotAnimate);

    if(!IS_MOBILE_SAFARI) {
      if(forwards) {
        appNavigationController.pushItem({
          type: this.navigationType,
          onPop: () => {
            this.cancelSelection();
          }
        });
      } else {
        appNavigationController.removeByType(this.navigationType);
      }
    }

    if(forceSelection) {
      (toggleResult || Promise.resolve()).then(() => this.updateContainer(forceSelection));
    }

    return true;
  }

  public cancelSelection = (doNotAnimate?: boolean) => {
    if(doNotAnimate) this.doNotAnimate = true;
    this.onCancelSelection?.();
    this.selectedMids.clear();
    this.toggleSelection();
    cancelSelection();
    if(doNotAnimate) this.doNotAnimate = undefined;
  };

  public cleanup() {
    this.doNotAnimate = true;
    this.selectedMids.clear();
    this.toggleSelection(false);
    this.doNotAnimate = undefined;
  }

  protected updateElementSelection(element: HTMLElement, isSelected: boolean) {
    this.toggleElementCheckbox(element, true);
    const input = this.getCheckboxInputFromElement(element);
    input.checked = isSelected;

    this.toggleSelection();
    this.updateContainer();
    SetTransition({
      element,
      className: 'is-selected',
      forwards: isSelected,
      duration: 200
    });
  }

  public isMidSelected(peerId: PeerId, mid: number) {
    const set = this.selectedMids.get(peerId);
    return !!set?.has(mid);
  }

  public length() {
    return accumulateMapSet(this.selectedMids);
  }

  protected toggleMid(peerId: PeerId, mid: number, unselect?: boolean) {
    let set = this.selectedMids.get(peerId);
    if(unselect || (unselect === undefined && set?.has(mid))) {
      if(set) {
        set.delete(mid);

        if(!set.size) {
          this.selectedMids.delete(peerId);
        }
      }
    } else {
      // const diff = rootScope.config.forwarded_count_max - this.length() - 1;
      // if(diff < 0) {
      //   toast(I18n.format('Chat.Selection.LimitToast', true));
      //   return false;
      //   /* const it = this.selectedMids.values();
      //   do {
      //     const mid = it.next().value;
      //     const mounted = this.appImManager.getMountedBubble(mid);
      //     if(mounted) {
      //       this.toggleByBubble(mounted.bubble);
      //     } else {
      //       const mids = this.appMessagesManager.getMidsByMid(mid);
      //       for(const mid of mids) {
      //         this.selectedMids.delete(mid);
      //       }
      //     }
      //   } while(this.selectedMids.size > MAX_SELECTION_LENGTH); */
      // }

      if(!set) {
        set = new Set();
        this.selectedMids.set(peerId, set);
      }

      set.add(mid);
    }

    return true;
  }

  /**
   * ! Call this method only to handle deleted messages
   */
  public deleteSelectedMids(peerId: PeerId, mids: number[], batch?: boolean) {
    const set = this.selectedMids.get(peerId);
    if(!set) {
      return;
    }

    mids.forEach((mid) => {
      set.delete(mid);
    });

    if(!set.size) {
      this.selectedMids.delete(peerId);
    }

    const after = () => {
      this.updateContainer();
      this.toggleSelection();
    };

    if(!batch) after();
    return after;
  }
}

export class SearchSelection extends AppSelection {
  protected selectionContainer: HTMLElement;
  protected selectionCountEl: HTMLElement;
  public selectionForwardBtn: HTMLElement;
  public selectionDeleteBtn: HTMLElement;
  public selectionGotoBtn: HTMLElement;
  public selectionPinBtn: HTMLElement;

  public isStoriesArchive: boolean;
  private isPrivate: boolean;

  constructor(
    private searchSuper: AppSearchSuper,
    managers: AppManagers,
    listenerSetter: ListenerSetter
  ) {
    super({
      managers,
      verifyTarget: (e, target) => !!target && this.isSelecting,
      getElementFromTarget: (target) => findUpClassName(target, 'search-super-item'),
      targetLookupClassName: 'search-super-item',
      lookupBetweenParentClassName: 'tabs-tab',
      lookupBetweenElementsQuery: '.search-super-item'
    });

    this.isPrivate = !searchSuper.showSender;
    !IS_TOUCH_SUPPORTED && this.attachListeners(searchSuper.container, listenerSetter);
  }

  /* public appendCheckbox(element: HTMLElement, checkboxField: CheckboxField) {
    checkboxField.label.classList.add('bubble-select-checkbox');

    if(element.classList.contains('document') || element.tagName === 'AUDIO-ELEMENT') {
      element.querySelector('.document, audio-element').append(checkboxField.label);
    } else {
      super.appendCheckbox(bubble, checkboxField);
    }
  } */

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const ret = super.toggleSelection(toggleCheckboxes, forceSelection);

    if(ret && toggleCheckboxes) {
      const elements = Array.from(this.searchSuper.tabsContainer.querySelectorAll('.search-super-item')) as HTMLElement[];
      elements.forEach((element) => {
        this.toggleElementCheckbox(element, this.isSelecting);
      });
    }

    return ret;
  }

  public toggleByElement = (element: HTMLElement) => {
    const mid = +element.dataset.mid;
    const peerId = element.dataset.peerId.toPeerId();

    if(!this.toggleMid(peerId, mid)) {
      return;
    }

    this.updateElementSelection(element, this.isMidSelected(peerId, mid));
  };

  public toggleByMid = (peerId: PeerId, mid: number) => {
    const element = this.searchSuper.mediaTab.contentTab.querySelector(`.search-super-item[data-peer-id="${peerId}"][data-mid="${mid}"]`) as HTMLElement;
    this.toggleByElement(element);
  };

  private getSelectedStoriesPeerId() {
    return [...this.selectedMids.keys()][0] || this.searchSuper.searchContext.peerId;
  }

  public onDeleteStoriesClick = async(ids?: number[]) => {
    const peerId = this.getSelectedStoriesPeerId();
    ids ||= [...this.selectedMids.get(peerId)];
    await confirmationPopup({
      titleLangKey: ids.length === 1 ? 'DeleteStoryTitle' : 'DeleteStoriesTitle',
      descriptionLangKey: ids.length === 1 ? 'DeleteStorySubtitle' : 'DeleteStoriesSubtitle',
      descriptionLangArgs: [ids.length],
      button: {
        langKey: 'Delete',
        isDanger: true
      }
    });
    this.cancelSelection();
    this.managers.appStoriesManager.deleteStories(peerId, ids);
  };

  public onPinStoriesClick = (ids: number[], pin: boolean) => {
    const peerId = this.getSelectedStoriesPeerId();
    ids ||= [...this.selectedMids.get(peerId)];
    const promise = this.managers.appStoriesManager.togglePinned(peerId, ids, pin);
    this.cancelSelection();
    promise.then(() => {
      if(ids.length === 1) {
        toastNew({langPackKey: pin ? 'StoryPinnedToProfile' : 'StoryArchivedFromProfile'});
      } else {
        toastNew({langPackKey: pin ? 'StorySavedTitle' : 'StoryArchived', langPackArguments: [ids.length]});
      }
    });
  };

  public onPinStoriesToTopClick = (ids: number[], pin: boolean) => {
    const peerId = this.getSelectedStoriesPeerId();
    const promise = this.managers.appStoriesManager.togglePinnedToTop(peerId, ids, pin);
    this.cancelSelection();
    promise.catch((err: ApiError) => {
      if(err.type === 'STORY_ID_TOO_MANY') {
        toastNew({langPackKey: 'StoriesPinLimit', langPackArguments: [+err.message]});
      }
    });
  };

  protected onUpdateContainer = (cantForward: boolean, cantDelete: boolean, cantSend: boolean, cantPin: boolean) => {
    const length = this.length();
    replaceContent(this.selectionCountEl, i18n(this.isStories ? 'StoriesCount' : 'messages', [length]));
    this.selectionPinBtn.classList.toggle('hide', !this.isStories || cantPin);
    this.selectionGotoBtn.classList.toggle('hide', this.isStories || length !== 1);
    this.selectionForwardBtn.classList.toggle('hide', cantForward);
    this.selectionDeleteBtn && this.selectionDeleteBtn.classList.toggle('hide', cantDelete);
  };

  protected onToggleSelection = (forwards: boolean, animate: boolean) => {
    SetTransition({
      element: this.searchSuper.navScrollableContainer,
      className: 'is-selecting',
      forwards,
      duration: animate ? 200 : 0,
      onTransitionEnd: () => {
        if(!this.isSelecting) {
          this.selectionContainer.remove();
          this.selectionContainer =
            this.selectionForwardBtn =
            this.selectionDeleteBtn =
            null;
          this.selectedText = undefined;
        }
      }
    });

    SetTransition({
      element: this.searchSuper.container,
      className: 'is-selecting',
      forwards,
      duration: 200
    });

    if(this.isSelecting) {
      if(!this.selectionContainer) {
        const BASE_CLASS = 'search-super-selection';
        this.selectionContainer = document.createElement('div');
        this.selectionContainer.classList.add(BASE_CLASS + '-container');

        const btnCancel = ButtonIcon(`close ${BASE_CLASS}-cancel`, {noRipple: true});
        attachClickEvent(btnCancel, () => this.cancelSelection(), {listenerSetter: this.listenerSetter, once: true});

        this.selectionCountEl = document.createElement('div');
        this.selectionCountEl.classList.add(BASE_CLASS + '-count');

        const attachClickOptions: AttachClickOptions = {listenerSetter: this.listenerSetter};

        this.selectionPinBtn = ButtonIcon(`${this.isStoriesArchive ? 'pin' : 'unpin'} ${BASE_CLASS}-pin`);
        attachClickEvent(this.selectionPinBtn, () => this.onPinStoriesClick(undefined, this.isStoriesArchive), attachClickOptions);

        this.selectionGotoBtn = ButtonIcon(`message ${BASE_CLASS}-goto`);
        attachClickEvent(this.selectionGotoBtn, () => {
          const peerId = [...this.selectedMids.keys()][0];
          const mid = [...this.selectedMids.get(peerId)][0];
          this.cancelSelection();

          appImManager.setInnerPeer({
            peerId,
            lastMsgId: mid,
            threadId: this.searchSuper.mediaTab.type === 'saved' ? this.searchSuper.searchContext.peerId : this.searchSuper.searchContext.threadId
          });
        }, attachClickOptions);

        this.selectionForwardBtn = ButtonIcon(`forward ${BASE_CLASS}-forward`);
        attachClickEvent(this.selectionForwardBtn, () => {
          const obj: {[fromPeerId: PeerId]: number[]} = {};
          for(const [fromPeerId, mids] of this.selectedMids) {
            obj[fromPeerId] = Array.from(mids).sort((a, b) => a - b);
          }

          PopupElement.createPopup(PopupForward, obj, () => {
            this.cancelSelection();
          });
        }, attachClickOptions);

        if(this.isPrivate) {
          this.selectionDeleteBtn = ButtonIcon(`delete danger ${BASE_CLASS}-delete`);
          attachClickEvent(this.selectionDeleteBtn, () => {
            if(this.isStories) {
              this.onDeleteStoriesClick();
              return;
            }

            const peerId = this.searchSuper.searchContext.peerId;
            PopupElement.createPopup(
              PopupDeleteMessages,
              peerId,
              this.getSelectedMids(),
              ChatType.Chat,
              () => {
                this.cancelSelection();
              }
            );
          }, attachClickOptions);
        }

        this.selectionContainer.append(...[
          btnCancel,
          this.selectionCountEl,
          this.selectionPinBtn,
          this.selectionGotoBtn,
          this.selectionForwardBtn,
          this.selectionDeleteBtn
        ].filter(Boolean));

        const transitionElement = this.selectionContainer;
        transitionElement.style.opacity = '0';
        this.searchSuper.navScrollableContainer.append(transitionElement);

        void transitionElement.offsetLeft; // reflow
        transitionElement.style.opacity = '';
      }
    }
  };
}

export default class ChatSelection extends AppSelection {
  protected selectionInputWrapper: HTMLElement;
  protected selectionContainer: HTMLElement;
  protected selectionCountEl: HTMLElement;
  public selectionSendNowBtn: HTMLElement;
  public selectionForwardBtn: HTMLElement;
  public selectionDeleteBtn: HTMLElement;
  private selectionLeft: HTMLDivElement;
  private selectionRight: HTMLDivElement;

  constructor(
    private chat: Chat,
    private bubbles: ChatBubbles,
    private input: ChatInput,
    managers: AppManagers
  ) {
    super({
      managers,
      getElementFromTarget: (target) => findUpClassName(target, 'grouped-item') || findUpClassName(target, 'bubble'),
      verifyTarget: (e, target) => {
        // LEFT BUTTON
        // проверка внизу нужна для того, чтобы не активировать селект если target потомок .bubble
        const bad = !this.selectedMids.size &&
          !(e.target as HTMLElement).classList.contains('bubble') &&
          !(e.target as HTMLElement).classList.contains('document-selection') &&
          target;

        return !bad;
      },
      verifyMouseMoveTarget: (e, element, selecting) => {
        const bad = e.target !== element &&
          !(e.target as HTMLElement).classList.contains('document-selection') &&
          selecting === undefined &&
          !this.selectedMids.size;
        return !bad;
      },
      verifyTouchLongPress: () => !this.chat.input.recording,
      targetLookupClassName: 'bubble',
      lookupBetweenParentClassName: 'bubbles-inner',
      lookupBetweenElementsQuery: '.bubble:not(.is-multiple-documents), .grouped-item',
      onTouchLongPress: () => {
        const {replySwipeHandler} = this.chat.bubbles;
        replySwipeHandler?.reset();
      }
    });
  }

  public appendCheckbox(bubble: HTMLElement, checkboxField: CheckboxField) {
    checkboxField.label.classList.add('bubble-select-checkbox');

    if(bubble.classList.contains('document-container')) {
      bubble.querySelector('.document, audio-element').append(checkboxField.label);
    } else {
      super.appendCheckbox(bubble, checkboxField);
    }
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const ret = super.toggleSelection(toggleCheckboxes, forceSelection);

    if(ret && toggleCheckboxes) {
      const history = this.bubbles.getRenderedHistory('asc');
      for(const fullMid of history) {
        if(this.bubbles.skippedMids.has(fullMid)) {
          continue;
        }

        const bubble = this.bubbles.getBubble(fullMid);
        this.toggleElementCheckbox(bubble, this.isSelecting);
      }
    }

    return ret;
  }

  public toggleElementCheckbox(bubble: HTMLElement, show: boolean) {
    if(!this.canSelectBubble(bubble)) return;

    const ret = super.toggleElementCheckbox(bubble, show);
    if(ret) {
      const isGrouped = bubble.classList.contains('is-grouped');
      if(isGrouped) {
        this.bubbles.getBubbleGroupedItems(bubble).forEach((item) => this.toggleElementCheckbox(item, show));
      }
    }

    return ret;
  }

  public toggleByElement = (bubble: HTMLElement): Promise<void> => {
    if(!this.canSelectBubble(bubble)) return;

    const mid = +bubble.dataset.mid;
    const peerId = bubble.dataset.peerId.toPeerId();

    const isGrouped = bubble.classList.contains('is-grouped');
    if(isGrouped) {
      if(!this.isGroupedBubbleSelected(bubble)) {
        const set = this.selectedMids.get(peerId);
        if(set) {
          // const mids = await this.chat.getMidsByMid(mid);
          const mids = this.getMidsFromGroupContainer(bubble);
          mids.forEach(({mid}) => set.delete(mid));
        }
      }

      /* const promises =  */this.bubbles.getBubbleGroupedItems(bubble).map(this.toggleByElement);
      // await Promise.all(promises);
      return;
    }

    if(!this.toggleMid(peerId, mid)) {
      return;
    }

    const isGroupedItem = bubble.classList.contains('grouped-item');
    if(isGroupedItem) {
      const groupContainer = findUpClassName(bubble, 'bubble');
      const isGroupedSelected = this.isGroupedBubbleSelected(groupContainer);
      const isGroupedMidsSelected = this.isGroupedMidsSelected(groupContainer);

      const willChange = isGroupedMidsSelected || isGroupedSelected;
      if(willChange) {
        this.updateElementSelection(groupContainer, isGroupedMidsSelected);
      }
    }

    this.updateElementSelection(bubble, this.isMidSelected(peerId, mid));
  };

  protected toggleByMid = async(peerId: PeerId, mid: number) => {
    const mounted = await this.bubbles.getMountedBubble(makeFullMid(peerId, mid));
    if(mounted) {
      this.toggleByElement(mounted.bubble);
    }
  };

  public isElementShouldBeSelected(element: HTMLElement) {
    const isGrouped = element.classList.contains('is-grouped');
    return super.isElementShouldBeSelected(element) && (!isGrouped || this.isGroupedMidsSelected(element));
  }

  protected isGroupedBubbleSelected(bubble: HTMLElement) {
    const groupedCheckboxInput = this.getCheckboxInputFromElement(bubble);
    return groupedCheckboxInput?.checked;
  }

  protected getMidsFromGroupContainer(groupContainer: HTMLElement) {
    const elements = this.chat.bubbles.getBubbleGroupedItems(groupContainer);
    if(!elements.length) {
      elements.push(groupContainer);
    }

    return elements.map((element) => {
      return {
        mid: +element.dataset.mid,
        peerId: element.dataset.peerId.toPeerId()
      }
    });
  }

  protected isGroupedMidsSelected(groupContainer: HTMLElement) {
    const mids = this.getMidsFromGroupContainer(groupContainer);
    const selectedMids = mids.filter(({peerId, mid}) => this.isMidSelected(peerId, mid));
    return mids.length === selectedMids.length;
  }

  protected getCheckboxInputFromElement(bubble: HTMLElement) {
    /* let perf = performance.now();
    let checkbox = bubble.firstElementChild.tagName === 'LABEL' && bubble.firstElementChild.firstElementChild as HTMLInputElement;
    console.log('getCheckboxInputFromBubble firstElementChild time:', performance.now() - perf);

    perf = performance.now();
    checkbox = bubble.querySelector('label input');
    console.log('getCheckboxInputFromBubble querySelector time:', performance.now() - perf); */
    /* let perf = performance.now();
    let contains = bubble.classList.contains('document-container');
    console.log('getCheckboxInputFromBubble classList time:', performance.now() - perf);

    perf = performance.now();
    contains = bubble.className.includes('document-container');
    console.log('getCheckboxInputFromBubble className time:', performance.now() - perf); */

    return bubble.classList.contains('document-container') ?
      bubble.querySelector('label input') as HTMLInputElement :
      super.getCheckboxInputFromElement(bubble);
  }

  public canSelectBubble(bubble: HTMLElement) {
    return bubble &&
      !bubble.classList.contains('service') &&
      !bubble.classList.contains('is-outgoing') &&
      !bubble.classList.contains('is-error') &&
      !bubble.classList.contains('bubble-first') &&
      !bubble.classList.contains('avoid-selection');
  }

  protected onToggleSelection = async(forwards: boolean, animate: boolean) => {
    const {needTranslateX, widthFrom, widthTo} = await this.chat.input.center(animate);

    SetTransition({
      element: this.listenElement,
      className: 'is-selecting',
      forwards,
      duration: animate ? 200 : 0,
      onTransitionEnd: () => {
        if(!this.isSelecting) {
          this.selectionInputWrapper.remove();
          this.selectionInputWrapper =
            this.selectionContainer =
            this.selectionSendNowBtn =
            this.selectionForwardBtn =
            this.selectionDeleteBtn =
            this.selectionLeft =
            this.selectionRight =
            null;
          this.selectedText = undefined;
        }

        /* fastRaf(() => {
          this.bubbles.onScroll();
        }); */
      }
    });

    // const chatInput = this.appImManager.chatInput;

    const translateButtonsX = widthFrom < widthTo ? undefined : needTranslateX * 2;
    if(this.isSelecting) {
      if(!this.selectionContainer) {
        this.selectionInputWrapper = document.createElement('div');
        this.selectionInputWrapper.classList.add('chat-input-wrapper', 'selection-wrapper');

        // const background = document.createElement('div');
        // background.classList.add('chat-input-wrapper-background');

        this.selectionContainer = document.createElement('div');
        this.selectionContainer.classList.add('selection-container');

        const attachClickOptions: AttachClickOptions = {listenerSetter: this.listenerSetter};
        const btnCancel = ButtonIcon('close', {noRipple: true});
        attachClickEvent(btnCancel, () => this.cancelSelection(), {once: true, listenerSetter: this.listenerSetter});

        this.selectionCountEl = document.createElement('div');
        this.selectionCountEl.classList.add('selection-container-count');

        if(this.chat.type === ChatType.Scheduled) {
          this.selectionSendNowBtn = Button('btn-primary btn-transparent btn-short text-bold selection-container-send', {icon: 'send2'});
          this.selectionSendNowBtn.append(i18n('MessageScheduleSend'));
          attachClickEvent(this.selectionSendNowBtn, () => {
            PopupElement.createPopup(PopupSendNow, this.chat.peerId, [...this.selectedMids.get(this.chat.peerId)], () => {
              this.cancelSelection();
            });
          }, attachClickOptions);
        } else {
          this.selectionForwardBtn = Button('btn-primary btn-transparent text-bold selection-container-forward', {icon: 'forward'});
          this.selectionForwardBtn.append(i18n('Forward'));
          attachClickEvent(this.selectionForwardBtn, () => {
            const obj: {[fromPeerId: PeerId]: number[]} = {};
            for(const [fromPeerId, mids] of this.selectedMids) {
              obj[fromPeerId] = Array.from(mids).sort((a, b) => a - b);
            }

            PopupElement.createPopup(PopupForward, obj, () => {
              this.cancelSelection();
            });
          }, attachClickOptions);
        }

        this.selectionDeleteBtn = Button('btn-primary btn-transparent danger text-bold selection-container-delete', {icon: 'delete'});
        this.selectionDeleteBtn.append(i18n('Delete'));
        attachClickEvent(this.selectionDeleteBtn, () => {
          // if(TEST_BUBBLES_DELETION) {
          //   return this.chat.bubbles.deleteMessagesByIds(this.getSelectedMids(), true);
          // }

          PopupElement.createPopup(
            PopupDeleteMessages,
            this.chat.peerId,
            this.getSelectedMids(),
            this.chat.type,
            () => {
              this.cancelSelection();
            }
          );
        }, attachClickOptions);

        const left = this.selectionLeft = document.createElement('div');
        left.classList.add('selection-container-left');
        left.append(btnCancel, this.selectionCountEl);

        const right = this.selectionRight = document.createElement('div');
        right.classList.add('selection-container-right');
        right.append(...[
          this.selectionSendNowBtn,
          this.selectionForwardBtn,
          this.selectionDeleteBtn
        ].filter(Boolean))

        if(translateButtonsX !== undefined) {
          left.style.transform = `translateX(${-translateButtonsX}px)`;
          right.style.transform = `translateX(${translateButtonsX}px)`;
        }

        this.selectionContainer.append(left, right);

        // background.style.opacity = '0';
        this.selectionInputWrapper.style.opacity = '0';
        this.selectionInputWrapper.append(/* background,  */this.selectionContainer);
        this.input.inputContainer.append(this.selectionInputWrapper);

        void this.selectionInputWrapper.offsetLeft; // reflow
        // background.style.opacity = '';
        this.selectionInputWrapper.style.opacity = '';
      }

      this.selectionLeft.style.transform = '';
      this.selectionRight.style.transform = '';
    } else if(this.selectionLeft && translateButtonsX !== undefined) {
      this.selectionLeft.style.transform = `translateX(-${translateButtonsX}px)`;
      this.selectionRight.style.transform = `translateX(${translateButtonsX}px)`;
    }
  };

  protected onUpdateContainer = (cantForward: boolean, cantDelete: boolean, cantSend: boolean) => {
    replaceContent(this.selectionCountEl, i18n('messages', [this.length()]));
    this.selectionSendNowBtn?.toggleAttribute('disabled', cantSend);
    this.selectionForwardBtn?.toggleAttribute('disabled', cantForward);
    this.selectionDeleteBtn?.toggleAttribute('disabled', cantDelete);
  };

  protected onCancelSelection = async() => {
    // return;
    // const promises: Promise<HTMLElement>[] = [];
    // for(const [peerId, mids] of this.selectedMids) {
    //   for(const mid of mids) {
    //     promises.push(this.bubbles.getMountedBubble(mid).then((m) => m?.bubble));
    //   }
    // }

    // const bubbles = filterUnique((await Promise.all(promises)).filter(Boolean));
    // bubbles.forEach((bubble) => {
    //   this.toggleByElement(bubble);
    // });
  };
}
