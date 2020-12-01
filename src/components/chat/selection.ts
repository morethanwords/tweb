import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type ChatBubbles from "./bubbles";
import type ChatInput from "./input";
import { isTouchSupported } from "../../helpers/touchSupport";
import { blurActiveElement, cancelEvent, cancelSelection, findUpClassName, getSelectedText } from "../../helpers/dom";
import Button from "../button";
import ButtonIcon from "../buttonIcon";
import CheckboxField from "../checkbox";
import PopupDeleteMessages from "../popupDeleteMessages";
import PopupForward from "../popupForward";
import { toast } from "../toast";
import SetTransition from "../singleTransition";
import ListenerSetter from "../../helpers/listenerSetter";

const MAX_SELECTION_LENGTH = 100;
//const MIN_CLICK_MOVE = 32; // minimum bubble height

export default class ChatSelection {
  public selectedMids: Set<number> = new Set();
  public isSelecting = false;

  private selectionContainer: HTMLElement;
  private selectionCountEl: HTMLElement;
  public selectionForwardBtn: HTMLElement;
  public selectionDeleteBtn: HTMLElement;

  public selectedText: string;

  private listenerSetter: ListenerSetter;

  constructor(private chatBubbles: ChatBubbles, private chatInput: ChatInput, private appMessagesManager: AppMessagesManager) {
    const bubblesContainer = chatBubbles.bubblesContainer;
    this.listenerSetter = chatBubbles.listenerSetter;

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
      if(e.button != 0
        || (
          !this.selectedMids.size 
          && !(e.target as HTMLElement).classList.contains('bubble')
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
        const bubble = findUpClassName(e.target, 'bubble');
        if(!bubble) {
          //console.error('found no bubble', e);
          return;
        }

        const mid = +bubble.dataset.mid;
        if(!mid) return;

        // * cancel selecting if selecting message text
        if(e.target != bubble && selecting === undefined && !this.selectedMids.size) {
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
              if(seen.size == 2) {
                [...seen].forEach(mid => {
                  const mounted = this.chatBubbles.getMountedBubble(mid);
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
    const hasCheckbox = !!this.getCheckboxInputFromBubble(bubble);
    const isAlbum = bubble.classList.contains('is-album');
    if(show) {
      if(hasCheckbox) return;
      
      const checkboxField = CheckboxField('', bubble.dataset.mid, true);
      checkboxField.label.classList.add('bubble-select-checkbox');

      // * if it is a render of new message
      const mid = +bubble.dataset.mid;
      if(this.selectedMids.has(mid) && (!isAlbum || this.isAlbumMidsSelected(mid))) {
        checkboxField.input.checked = true;
        bubble.classList.add('is-selected');
      }

      bubble.prepend(checkboxField.label);
    } else if(hasCheckbox) {
      bubble.firstElementChild.remove();
    }

    if(isAlbum) {
      this.chatBubbles.getBubbleAlbumItems(bubble).forEach(item => this.toggleBubbleCheckbox(item, show));
    }
  }

  public getCheckboxInputFromBubble(bubble: HTMLElement) {
    return bubble.firstElementChild.tagName == 'LABEL' && bubble.firstElementChild.firstElementChild as HTMLInputElement;
  }

  public updateForwardContainer(forceSelection = false) {
    if(!this.selectedMids.size && !forceSelection) return;
    this.selectionCountEl.innerText = this.selectedMids.size + ' Message' + (this.selectedMids.size == 1 ? '' : 's');

    let cantForward = !this.selectedMids.size, cantDelete = !this.selectedMids.size;
    for(const mid of this.selectedMids.values()) {
      const message = this.appMessagesManager.getMessage(mid);
      if(!cantForward) {
        if(message.action) {
          cantForward = true;
        }
      }
      

      if(!cantDelete) {
        const canDelete = this.appMessagesManager.canDeleteMessage(mid);
        if(!canDelete) {
          cantDelete = true;
        }
      }

      if(cantForward && cantDelete) break;
    }

    this.selectionForwardBtn.toggleAttribute('disabled', cantForward);
    this.selectionDeleteBtn.toggleAttribute('disabled', cantDelete);
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const wasSelecting = this.isSelecting;
    this.isSelecting = this.selectedMids.size > 0 || forceSelection;

    if(wasSelecting == this.isSelecting) return;
    
    const bubblesContainer = this.chatBubbles.bubblesContainer;
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
    }

    blurActiveElement(); // * for mobile keyboards

    SetTransition(bubblesContainer, 'is-selecting', !!this.selectedMids.size || forceSelection, 200, () => {
      if(!this.isSelecting) {
        this.selectionContainer.remove();
        this.selectionContainer = this.selectionForwardBtn = this.selectionDeleteBtn = null;
        this.selectedText = undefined;
      }
      
      window.requestAnimationFrame(() => {
        this.chatBubbles.onScroll();
      });
    });

    //const chatInput = this.appImManager.chatInput;

    if(this.isSelecting) {
      if(!this.selectionContainer) {
        this.selectionContainer = document.createElement('div');
        this.selectionContainer.classList.add('selection-container');

        const btnCancel = ButtonIcon('close', {noRipple: true});
        this.listenerSetter.add(btnCancel, 'click', this.cancelSelection, {once: true});

        this.selectionCountEl = document.createElement('div');
        this.selectionCountEl.classList.add('selection-container-count');

        this.selectionForwardBtn = Button('btn-primary btn-transparent selection-container-forward', {icon: 'forward'});
        this.selectionForwardBtn.append('Forward');
        this.listenerSetter.add(this.selectionForwardBtn, 'click', () => {
          new PopupForward([...this.selectedMids], () => {
            this.cancelSelection();
          });
        });

        this.selectionDeleteBtn = Button('btn-primary btn-transparent danger selection-container-delete', {icon: 'delete'});
        this.selectionDeleteBtn.append('Delete');
        this.listenerSetter.add(this.selectionDeleteBtn, 'click', () => {
          new PopupDeleteMessages([...this.selectedMids], () => {
            this.cancelSelection();
          });
        });

        this.selectionContainer.append(btnCancel, this.selectionCountEl, this.selectionForwardBtn, this.selectionDeleteBtn);

        this.chatInput.rowsWrapper.append(this.selectionContainer);
      }
    }

    if(toggleCheckboxes) {
      for(const mid in this.chatBubbles.bubbles) {
        const bubble = this.chatBubbles.bubbles[mid];
        this.toggleBubbleCheckbox(bubble, this.isSelecting);
      }
    }

    if(forceSelection) {
      this.updateForwardContainer(forceSelection);
    }
  }

  public cancelSelection = () => {
    for(const mid of this.selectedMids) {
      const mounted = this.chatBubbles.getMountedBubble(mid);
      if(mounted) {
        this.toggleByBubble(mounted.message.grouped_id ? mounted.bubble.querySelector(`.album-item[data-mid="${mid}"]`) : mounted.bubble);
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
    this.updateForwardContainer();
    SetTransition(bubble, 'is-selected', isSelected, 200);
  }

  public isAlbumBubbleSelected(bubble: HTMLElement) {
    const albumCheckboxInput = this.getCheckboxInputFromBubble(bubble);
    return albumCheckboxInput?.checked;
  }

  public isAlbumMidsSelected(mid: number) {
    const mids = this.appMessagesManager.getMidsByMid(mid);
    const selectedMids = mids.filter(mid => this.selectedMids.has(mid));
    return mids.length == selectedMids.length;
  }

  public toggleByBubble = (bubble: HTMLElement) => {
    const mid = +bubble.dataset.mid;

    const isAlbum = bubble.classList.contains('is-album');
    if(isAlbum) {
      if(!this.isAlbumBubbleSelected(bubble)) {
        const mids = this.appMessagesManager.getMidsByMid(mid);
        mids.forEach(mid => this.selectedMids.delete(mid));
      }

      this.chatBubbles.getBubbleAlbumItems(bubble).forEach(this.toggleByBubble);
      return;
    }

    const found = this.selectedMids.has(mid);
    if(found) {
      this.selectedMids.delete(mid);
    } else {
      const diff = MAX_SELECTION_LENGTH - this.selectedMids.size - 1;
      if(diff < 0) {
        toast('Max selection count reached.');
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

    const isAlbumItem = bubble.classList.contains('album-item');
    if(isAlbumItem) {
      const albumContainer = findUpClassName(bubble, 'bubble');
      const isAlbumSelected = this.isAlbumBubbleSelected(albumContainer);
      const isAlbumMidsSelected = this.isAlbumMidsSelected(mid);

      const willChange = isAlbumMidsSelected || isAlbumSelected;
      if(willChange) {
        this.updateBubbleSelection(albumContainer, isAlbumMidsSelected);
      }
    }

    this.updateBubbleSelection(bubble, !found);
  };
}