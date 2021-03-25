import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type ChatBubbles from "./bubbles";
import type ChatInput from "./input";
import type Chat from "./chat";
import { isTouchSupported } from "../../helpers/touchSupport";
import { blurActiveElement, cancelEvent, cancelSelection, findUpClassName, getSelectedText } from "../../helpers/dom";
import Button from "../button";
import ButtonIcon from "../buttonIcon";
import CheckboxField from "../checkboxField";
import PopupDeleteMessages from "../popups/deleteMessages";
import PopupForward from "../popups/forward";
import { toast } from "../toast";
import SetTransition from "../singleTransition";
import ListenerSetter from "../../helpers/listenerSetter";
import PopupSendNow from "../popups/sendNow";
import appNavigationController from "../appNavigationController";
import { isMobileSafari } from "../../helpers/userAgent";
import I18n, { i18n, _i18n } from "../../lib/langPack";

const MAX_SELECTION_LENGTH = 100;
//const MIN_CLICK_MOVE = 32; // minimum bubble height

export default class ChatSelection {
  public selectedMids: Set<number> = new Set();
  public isSelecting = false;

  private selectionInputWrapper: HTMLElement;
  private selectionContainer: HTMLElement;
  private selectionCountEl: HTMLElement;
  public selectionSendNowBtn: HTMLElement;
  public selectionForwardBtn: HTMLElement;
  public selectionDeleteBtn: HTMLElement;

  public selectedText: string;

  private listenerSetter: ListenerSetter;

  constructor(private chat: Chat, private bubbles: ChatBubbles, private input: ChatInput, private appMessagesManager: AppMessagesManager) {
    const bubblesContainer = bubbles.bubblesContainer;
    this.listenerSetter = bubbles.listenerSetter;

    if(isTouchSupported) {
      this.listenerSetter.add(bubblesContainer, 'touchend', (e) => {
        if(!this.isSelecting) return;
        this.selectedText = getSelectedText();
      });
      return;
    }

    this.listenerSetter.add(bubblesContainer, 'mousedown', (e) => {
      //console.log('selection mousedown', e);
      const bubble = findUpClassName(e.target, 'bubble');
      // LEFT BUTTON
      // проверка внизу нужна для того, чтобы не активировать селект если target потомок .bubble
      if(e.button !== 0
        || (
          !this.selectedMids.size 
          && !(e.target as HTMLElement).classList.contains('bubble')
          && !(e.target as HTMLElement).classList.contains('document-selection')
          && bubble
          )
        ) {
        return;
      }
      
      const seen: Set<number> = new Set();
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

      //const foundTargets: Map<HTMLElement, true> = new Map();
      let canceledSelection = false;
      const onMouseMove = (e: MouseEvent) => {
        if(!canceledSelection) {
          cancelSelection();
          canceledSelection = true;
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
        const bubble = findUpClassName(e.target, 'grouped-item') || findUpClassName(e.target, 'bubble');
        if(!bubble) {
          //console.error('found no bubble', e);
          return;
        }

        const mid = +bubble.dataset.mid;
        if(!mid) return;

        // * cancel selecting if selecting message text
        if(e.target !== bubble && !(e.target as HTMLElement).classList.contains('document-selection') && selecting === undefined && !this.selectedMids.size) {
          this.listenerSetter.removeManual(bubblesContainer, 'mousemove', onMouseMove);
          this.listenerSetter.removeManual(document, 'mouseup', onMouseUp, documentListenerOptions);
          return;
        }

        if(!seen.has(mid)) {
          const isBubbleSelected = this.selectedMids.has(mid);
          if(selecting === undefined) {
            //bubblesContainer.classList.add('no-select');
            selecting = !isBubbleSelected;
          }

          seen.add(mid);

          if((selecting && !isBubbleSelected) || (!selecting && isBubbleSelected)) {
            if(!this.selectedMids.size) {
              if(seen.size === 2) {
                [...seen].forEach(mid => {
                  const mounted = this.bubbles.getMountedBubble(mid);
                  if(mounted) {
                    this.toggleByBubble(mounted.bubble);
                  }
                })
              }
            } else {
              this.toggleByBubble(bubble);
            }
          }
        }
        //console.log('onMouseMove', target);
      };

      const onMouseUp = (e: MouseEvent) => {
        if(seen.size) {
          window.addEventListener('click', (e) => {
            cancelEvent(e);
          }, {capture: true, once: true, passive: false});
        }

        this.listenerSetter.removeManual(bubblesContainer, 'mousemove', onMouseMove);
        //bubblesContainer.classList.remove('no-select');

        // ! CANCEL USER SELECTION !
        cancelSelection();
      };

      const documentListenerOptions = {once: true};
      this.listenerSetter.add(bubblesContainer, 'mousemove', onMouseMove);
      this.listenerSetter.add(document, 'mouseup', onMouseUp, documentListenerOptions);
    });
  }

  public toggleBubbleCheckbox(bubble: HTMLElement, show: boolean) {
    if(!this.canSelectBubble(bubble)) return;

    const hasCheckbox = !!this.getCheckboxInputFromBubble(bubble);
    const isGrouped = bubble.classList.contains('is-grouped');
    if(show) {
      if(hasCheckbox) return;
      
      const checkboxField = new CheckboxField({
        name: bubble.dataset.mid, 
        round: true
      });
      checkboxField.label.classList.add('bubble-select-checkbox');

      // * if it is a render of new message
      const mid = +bubble.dataset.mid;
      if(this.selectedMids.has(mid) && (!isGrouped || this.isGroupedMidsSelected(mid))) {
        checkboxField.input.checked = true;
        bubble.classList.add('is-selected');
      }

      if(bubble.classList.contains('document-container')) {
        bubble.querySelector('.document, audio-element').append(checkboxField.label);
      } else {
        bubble.prepend(checkboxField.label);
      }
    } else if(hasCheckbox) {
      this.getCheckboxInputFromBubble(bubble).parentElement.remove();
    }

    if(isGrouped) {
      this.bubbles.getBubbleGroupedItems(bubble).forEach(item => this.toggleBubbleCheckbox(item, show));
    }
  }

  private getCheckboxInputFromBubble(bubble: HTMLElement): HTMLInputElement {
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
      bubble.querySelector('label input') : 
      bubble.firstElementChild.tagName === 'LABEL' && bubble.firstElementChild.firstElementChild as HTMLInputElement;
  }

  private updateContainer(forceSelection = false) {
    if(!this.selectedMids.size && !forceSelection) return;
    this.selectionCountEl.textContent = '';
    this.selectionCountEl.append(i18n('Chat.Selection.MessagesCount', [this.selectedMids.size]));

    let cantForward = !this.selectedMids.size, cantDelete = !this.selectedMids.size, cantSend = !this.selectedMids.size;
    for(const mid of this.selectedMids.values()) {
      const message = this.appMessagesManager.getMessageByPeer(this.bubbles.peerId, mid);
      if(!cantForward) {
        if(message.action) {
          cantForward = true;
        }
      }
      

      if(!cantDelete) {
        const canDelete = this.appMessagesManager.canDeleteMessage(this.chat.getMessage(mid));
        if(!canDelete) {
          cantDelete = true;
        }
      }

      if(cantForward && cantDelete) break;
    }

    this.selectionSendNowBtn && this.selectionSendNowBtn.toggleAttribute('disabled', cantSend);
    this.selectionForwardBtn && this.selectionForwardBtn.toggleAttribute('disabled', cantForward);
    this.selectionDeleteBtn.toggleAttribute('disabled', cantDelete);
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const wasSelecting = this.isSelecting;
    this.isSelecting = this.selectedMids.size > 0 || forceSelection;

    if(wasSelecting === this.isSelecting) return;
    
    const bubblesContainer = this.bubbles.bubblesContainer;
    //bubblesContainer.classList.toggle('is-selecting', !!this.selectedMids.size);

    /* if(bubblesContainer.classList.contains('is-chat-input-hidden')) {
      const scrollable = this.appImManager.scrollable;
      if(scrollable.isScrolledDown) {
        scrollable.scrollTo(scrollable.scrollHeight, 'top', true, true, 200);
      }
    } */

    if(!isTouchSupported) {
      bubblesContainer.classList.toggle('no-select', this.isSelecting);

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

    blurActiveElement(); // * for mobile keyboards

    let transform = '', borderRadius = '';
    const forwards = !!this.selectedMids.size || forceSelection;
    if(forwards) {
      const p = this.input.rowsWrapper.parentElement;
      const fakeSelectionWrapper = p.querySelector('.fake-selection-wrapper');
      const fakeRowsWrapper = p.querySelector('.fake-rows-wrapper');
      const fakeSelectionRect = fakeSelectionWrapper.getBoundingClientRect();
      const fakeRowsRect = fakeRowsWrapper.getBoundingClientRect();
      const widthFrom = fakeRowsRect.width;
      const widthTo = fakeSelectionRect.width;

      if(widthFrom !== widthTo) {
        const scale = (widthTo/*  - 8 */) / widthFrom;
        const initTranslateX = (widthFrom - widthTo) / 2;
        const needTranslateX = fakeSelectionRect.left - fakeRowsRect.left - initTranslateX;
        transform = `translateX(${needTranslateX}px) scaleX(${scale})`;

        if(scale < 1) {
          const br = 12;
          borderRadius = '' + (br + br * (1 - scale)) + 'px';
        }
        //scale = widthTo / widthFrom;
      }
    }

    SetTransition(this.input.rowsWrapper, 'is-centering', forwards, 200);
    this.input.rowsWrapper.style.transform = transform;
    this.input.rowsWrapper.style.borderRadius = borderRadius;
    SetTransition(bubblesContainer, 'is-selecting', forwards, 200, () => {
      if(!this.isSelecting) {
        this.selectionInputWrapper.remove();
        this.selectionInputWrapper = this.selectionContainer = this.selectionSendNowBtn = this.selectionForwardBtn = this.selectionDeleteBtn = null;
        this.selectedText = undefined;
      }
      
      window.requestAnimationFrame(() => {
        this.bubbles.onScroll();
      });
    });

    if(!isMobileSafari) {
      if(forwards) {
        appNavigationController.pushItem({
          type: 'multiselect',
          onPop: () => {
            this.cancelSelection();
          }
        });
      } else {
        appNavigationController.removeByType('multiselect');
      }
    }

    //const chatInput = this.appImManager.chatInput;

    if(this.isSelecting) {
      if(!this.selectionContainer) {
        this.selectionInputWrapper = document.createElement('div');
        this.selectionInputWrapper.classList.add('chat-input-wrapper', 'selection-wrapper');

        this.selectionContainer = document.createElement('div');
        this.selectionContainer.classList.add('selection-container');

        const btnCancel = ButtonIcon('close', {noRipple: true});
        this.listenerSetter.add(btnCancel, 'click', this.cancelSelection, {once: true});

        this.selectionCountEl = document.createElement('div');
        this.selectionCountEl.classList.add('selection-container-count');

        if(this.chat.type === 'scheduled') {
          this.selectionSendNowBtn = Button('btn-primary btn-transparent btn-short text-bold selection-container-send', {icon: 'send2'});
          _i18n(this.selectionSendNowBtn, 'Chat.Context.Scheduled.SendNow');
          this.listenerSetter.add(this.selectionSendNowBtn, 'click', () => {
            new PopupSendNow(this.bubbles.peerId, [...this.selectedMids], () => {
              this.cancelSelection();
            })
          });
        } else {
          this.selectionForwardBtn = Button('btn-primary btn-transparent text-bold selection-container-forward', {icon: 'forward'});
          _i18n(this.selectionForwardBtn, 'Forward');
          this.listenerSetter.add(this.selectionForwardBtn, 'click', () => {
            new PopupForward(this.bubbles.peerId, [...this.selectedMids], () => {
              this.cancelSelection();
            });
          });
        }

        this.selectionDeleteBtn = Button('btn-primary btn-transparent danger text-bold selection-container-delete', {icon: 'delete'});
        _i18n(this.selectionDeleteBtn, 'Delete');
        this.listenerSetter.add(this.selectionDeleteBtn, 'click', () => {
          new PopupDeleteMessages(this.bubbles.peerId, [...this.selectedMids], this.chat.type, () => {
            this.cancelSelection();
          });
        });

        this.selectionContainer.append(...[btnCancel, this.selectionCountEl, this.selectionSendNowBtn, this.selectionForwardBtn, this.selectionDeleteBtn].filter(Boolean));

        this.selectionInputWrapper.style.opacity = '0';
        this.selectionInputWrapper.append(this.selectionContainer);
        this.input.rowsWrapper.parentElement.append(this.selectionInputWrapper);

        void this.selectionInputWrapper.offsetLeft; // reflow
        this.selectionInputWrapper.style.opacity = '';
      }
    }

    if(toggleCheckboxes) {
      for(const mid in this.bubbles.bubbles) {
        const bubble = this.bubbles.bubbles[mid];
        this.toggleBubbleCheckbox(bubble, this.isSelecting);
      }
    }

    if(forceSelection) {
      this.updateContainer(forceSelection);
    }
  }

  public cancelSelection = () => {
    for(const mid of this.selectedMids) {
      const mounted = this.bubbles.getMountedBubble(mid);
      if(mounted) {
        //this.toggleByBubble(mounted.message.grouped_id ? mounted.bubble.querySelector(`.grouped-item[data-mid="${mid}"]`) : mounted.bubble);
        this.toggleByBubble(mounted.bubble);
      }
      /* const bubble = this.appImManager.bubbles[mid];
      if(bubble) {
        this.toggleByBubble(bubble);
      } */
    }

    this.selectedMids.clear();
    this.toggleSelection();
    cancelSelection();
  };

  public cleanup() {
    this.selectedMids.clear();
    this.toggleSelection(false);
  }

  private updateBubbleSelection(bubble: HTMLElement, isSelected: boolean) {
    this.toggleBubbleCheckbox(bubble, true);
    const input = this.getCheckboxInputFromBubble(bubble);
    input.checked = isSelected;

    this.toggleSelection();
    this.updateContainer();
    SetTransition(bubble, 'is-selected', isSelected, 200);
  }

  private isGroupedBubbleSelected(bubble: HTMLElement) {
    const groupedCheckboxInput = this.getCheckboxInputFromBubble(bubble);
    return groupedCheckboxInput?.checked;
  }

  private isGroupedMidsSelected(mid: number) {
    const mids = this.chat.getMidsByMid(mid);
    const selectedMids = mids.filter(mid => this.selectedMids.has(mid));
    return mids.length === selectedMids.length;
  }

  public toggleByBubble = (bubble: HTMLElement) => {
    if(!this.canSelectBubble(bubble)) return;

    const mid = +bubble.dataset.mid;

    const isGrouped = bubble.classList.contains('is-grouped');
    if(isGrouped) {
      if(!this.isGroupedBubbleSelected(bubble)) {
        const mids = this.chat.getMidsByMid(mid);
        mids.forEach(mid => this.selectedMids.delete(mid));
      }

      this.bubbles.getBubbleGroupedItems(bubble).forEach(this.toggleByBubble);
      return;
    }

    const found = this.selectedMids.has(mid);
    if(found) {
      this.selectedMids.delete(mid);
    } else {
      const diff = MAX_SELECTION_LENGTH - this.selectedMids.size - 1;
      if(diff < 0) {
        toast(I18n.format('Chat.Selection.LimitToast', true));
        return;
        /* const it = this.selectedMids.values();
        do {
          const mid = it.next().value;
          const mounted = this.appImManager.getMountedBubble(mid);
          if(mounted) {
            this.toggleByBubble(mounted.bubble);
          } else {
            const mids = this.appMessagesManager.getMidsByMid(mid);
            for(const mid of mids) {
              this.selectedMids.delete(mid);
            }
          }
        } while(this.selectedMids.size > MAX_SELECTION_LENGTH); */
      }

      this.selectedMids.add(mid);
    }

    const isGroupedItem = bubble.classList.contains('grouped-item');
    if(isGroupedItem) {
      const groupContainer = findUpClassName(bubble, 'bubble');
      const isGroupedSelected = this.isGroupedBubbleSelected(groupContainer);
      const isGroupedMidsSelected = this.isGroupedMidsSelected(mid);

      const willChange = isGroupedMidsSelected || isGroupedSelected;
      if(willChange) {
        this.updateBubbleSelection(groupContainer, isGroupedMidsSelected);
      }
    }

    this.updateBubbleSelection(bubble, !found);
  };

  /**
   * ! Call this method only to handle deleted messages
   */
  public deleteSelectedMids(mids: number[]) {
    mids.forEach(mid => {
      this.selectedMids.delete(mid);
    });

    this.updateContainer();
    this.toggleSelection();
  }

  public canSelectBubble(bubble: HTMLElement) {
    return !bubble.classList.contains('service') && !bubble.classList.contains('is-sending');
  }
}
