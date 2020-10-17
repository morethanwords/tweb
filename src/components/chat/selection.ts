import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import CheckboxField from "../checkbox";

export default class ChatSelection {
  public selectedMids: Set<number> = new Set();
  public isSelecting = false;

  constructor(private appImManager: AppImManager, private appMessagesManager: AppMessagesManager) {

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

      bubble.append(checkboxField.label);
    } else if(hasCheckbox) {
      bubble.lastElementChild.remove();
    }
  }

  public getCheckboxInputFromBubble(bubble: HTMLElement) {
    return bubble.lastElementChild.tagName == 'LABEL' && bubble.lastElementChild.firstElementChild as HTMLInputElement;
  }

  public toggleSelection() {
    const wasSelecting = this.isSelecting;
    this.isSelecting = this.selectedMids.size > 0;

    if(wasSelecting == this.isSelecting) return;
    
    this.appImManager.bubblesContainer.classList.toggle('is-selecting', !!this.selectedMids.size);

    for(const mid in this.appImManager.bubbles) {
      const bubble = this.appImManager.bubbles[mid];
      this.toggleBubbleCheckbox(bubble, this.isSelecting);
    }
  }

  public cancelSelection() {
    for(const mid of this.selectedMids) {
      const bubble = this.appImManager.bubbles[mid];
      if(bubble) {
        this.toggleByBubble(bubble);
      }
    }

    this.selectedMids.clear();
    this.toggleSelection();
  }

  public cleanup() {
    this.isSelecting = false;
    this.selectedMids.clear();
    this.appImManager.bubblesContainer.classList.remove('is-selecting');
  }

  public toggleByBubble(bubble: HTMLElement) {
    const mid = +bubble.dataset.mid;
    const mids = this.appMessagesManager.getMidsByMid(mid);

    const found = mids.find(mid => this.selectedMids.has(mid));
    if(found) {
      mids.forEach(mid => this.selectedMids.delete(mid));
    } else {
      mids.forEach(mid => this.selectedMids.add(mid));
    }

    this.toggleBubbleCheckbox(bubble, true);
    const input = this.getCheckboxInputFromBubble(bubble);
    input.checked = !found;

    this.toggleSelection();
    if(found) {
      bubble.classList.add('backwards');
      bubble.dataset.timeout = '' + setTimeout(() => {
        delete bubble.dataset.timeout;
        bubble.classList.remove('backwards', 'is-selected');
      }, 200);
    } else {
      bubble.classList.remove('backwards');
      const timeout = bubble.dataset.timeout;
      if(timeout !== undefined) {
        clearTimeout(+timeout);
      }

      bubble.classList.add('is-selected');
    }
  }

  public selectMessage(mid: number) {
    
  }
}