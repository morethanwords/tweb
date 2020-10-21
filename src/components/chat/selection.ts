import { isTouchSupported } from "../../helpers/touchSupport";
import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import { cancelEvent, cancelSelection, findUpClassName, getSelectedText } from "../../lib/utils";
import Button from "../button";
import ButtonIcon from "../buttonIcon";
import CheckboxField from "../checkbox";
import PopupDeleteMessages from "../popupDeleteMessages";
import PopupForward from "../popupForward";
import { toast } from "../toast";

const SetTransition = (element: HTMLElement, className: string, forwards: boolean, duration: number, onTransitionEnd?: () => void) => {
  const timeout = element.dataset.timeout;
  if(timeout !== undefined) {
    clearTimeout(+timeout);
  }

  if(forwards) {
    element.classList.add(className);
  }

  element.classList.add('animating');

  element.classList.toggle('backwards', !forwards);
  element.dataset.timeout = '' + setTimeout(() => {
    delete element.dataset.timeout;
    if(!forwards) {
      element.classList.remove('backwards', className);
    }

    element.classList.remove('animating');
    
    onTransitionEnd && onTransitionEnd();
  }, duration);
};

const MAX_SELECTION_LENGTH = 100;
//const MIN_CLICK_MOVE = 32; // minimum bubble height

export default class ChatSelection {
  public selectedMids: Set<number> = new Set();
  public isSelecting = false;

  private selectionContainer: HTMLElement;
  private selectionCountEl: HTMLElement;
  private selectionForwardBtn: HTMLElement;
  private selectionDeleteBtn: HTMLElement;

  public selectedText: string;

  constructor(private appImManager: AppImManager, private appMessagesManager: AppMessagesManager) {
    const bubblesContainer = appImManager.bubblesContainer;

    if(isTouchSupported) {
      bubblesContainer.addEventListener('touchend', (e) => {
        if(!this.isSelecting) return;
        this.selectedText = getSelectedText();
      });
      return;
    }

    bubblesContainer.addEventListener('mousedown', (e) => {
      //console.log('selection mousedown', e);
      if(e.button != 0 || (!this.selectedMids.size && !(e.target as HTMLElement).classList.contains('bubble'))) { // LEFT BUTTON
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
      const onMouseMove = (e: MouseEvent) => {
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
          console.error('found no bubble', e);
          return;
        }

        const mid = +bubble.dataset.mid;
        if(!mid) return;

        if(e.target != bubble && selecting === undefined) {
          bubblesContainer.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
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
                  const mounted = this.appImManager.getMountedBubble(mid);
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

        bubblesContainer.removeEventListener('mousemove', onMouseMove);
        //bubblesContainer.classList.remove('no-select');

        // ! CANCEL USER SELECTION !
        cancelSelection();
      };

      bubblesContainer.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp, {once: true});
    });
  }

  public toggleBubbleCheckbox(bubble: HTMLElement, show: boolean) {
    const hasCheckbox = !!this.getCheckboxInputFromBubble(bubble);
    if(show) {
      if(hasCheckbox) return;
      
      const checkboxField = CheckboxField('', bubble.dataset.mid, true);
      checkboxField.label.classList.add('bubble-select-checkbox');

      // * if it is a render of new message
      const mid = +bubble.dataset.mid;
      if(this.selectedMids.has(mid)) {
        checkboxField.input.checked = true;
        bubble.classList.add('is-selected');
      }

      bubble.prepend(checkboxField.label);
    } else if(hasCheckbox) {
      bubble.firstElementChild.remove();
    }
  }

  public getCheckboxInputFromBubble(bubble: HTMLElement) {
    return bubble.firstElementChild.tagName == 'LABEL' && bubble.firstElementChild.firstElementChild as HTMLInputElement;
  }

  public updateForwardContainer() {
    if(!this.selectedMids.size) return;
    this.selectionCountEl.innerText = this.selectedMids.size + ' Message' + (this.selectedMids.size == 1 ? '' : 's');

    let cantForward = false, cantDelete = false;
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

  public toggleSelection(toggleCheckboxes = true) {
    const wasSelecting = this.isSelecting;
    this.isSelecting = this.selectedMids.size > 0;

    if(wasSelecting == this.isSelecting) return;
    
    const bubblesContainer = this.appImManager.bubblesContainer;
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

    SetTransition(bubblesContainer, 'is-selecting', !!this.selectedMids.size, 200, () => {
      if(!this.isSelecting) {
        this.selectionContainer.remove();
        this.selectionContainer = this.selectionForwardBtn = this.selectionDeleteBtn = null;
        this.selectedText = undefined;
      }
      
      window.requestAnimationFrame(() => {
        this.appImManager.onScroll();
      });
    });

    //const chatInput = this.appImManager.chatInput;

    if(this.isSelecting) {
      if(!this.selectionContainer) {
        const inputMessageDiv = document.querySelector('.input-message');
        this.selectionContainer = document.createElement('div');
        this.selectionContainer.classList.add('selection-container');

        const btnCancel = ButtonIcon('close', {noRipple: true});
        btnCancel.addEventListener('click', this.cancelSelection, {once: true});

        this.selectionCountEl = document.createElement('div');
        this.selectionCountEl.classList.add('selection-container-count');

        this.selectionForwardBtn = Button('btn-primary btn-transparent selection-container-forward', {icon: 'forward'});
        this.selectionForwardBtn.append('Forward');
        this.selectionForwardBtn.addEventListener('click', () => {
          new PopupForward([...this.selectedMids], () => {
            this.cancelSelection();
          });
        });

        this.selectionDeleteBtn = Button('btn-primary btn-transparent danger selection-container-delete', {icon: 'delete'});
        this.selectionDeleteBtn.append('Delete');
        this.selectionDeleteBtn.addEventListener('click', () => {
          new PopupDeleteMessages([...this.selectedMids], () => {
            this.cancelSelection();
          });
        });

        this.selectionContainer.append(btnCancel, this.selectionCountEl, this.selectionForwardBtn, this.selectionDeleteBtn);

        inputMessageDiv.append(this.selectionContainer);
      }
    }

    if(toggleCheckboxes) {
      for(const mid in this.appImManager.bubbles) {
        const bubble = this.appImManager.bubbles[mid];
        this.toggleBubbleCheckbox(bubble, this.isSelecting);
      }
    }
  }

  public cancelSelection = () => {
    for(const mid of this.selectedMids) {
      const bubble = this.appImManager.bubbles[mid];
      if(bubble) {
        this.toggleByBubble(bubble);
      }
    }

    this.selectedMids.clear();
    this.toggleSelection();
    cancelSelection();
  };

  public cleanup() {
    this.selectedMids.clear();
    this.toggleSelection(false);
  }

  public toggleByBubble(bubble: HTMLElement) {
    const mid = +bubble.dataset.mid;
    const mids = this.appMessagesManager.getMidsByMid(mid);

    const found = mids.find(mid => this.selectedMids.has(mid));
    if(found) {
      mids.forEach(mid => this.selectedMids.delete(mid));
    } else {
      let diff = MAX_SELECTION_LENGTH - this.selectedMids.size - mids.length;
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

      mids.forEach(mid => this.selectedMids.add(mid));
    }

    this.toggleBubbleCheckbox(bubble, true);
    const input = this.getCheckboxInputFromBubble(bubble);
    input.checked = !found;

    this.toggleSelection();
    this.updateForwardContainer();
    SetTransition(bubble, 'is-selected', !found, 200);
  }
}