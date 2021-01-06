import SidebarSlider, { SliderSuperTab } from "../../slider";
import AppSelectPeers from "../../appSelectPeers";
import { putPreloader } from "../../misc";
import Button from "../../button";

export default class AppAddMembersTab extends SliderSuperTab {
  private nextBtn: HTMLButtonElement;
  private selector: AppSelectPeers;
  private peerType: 'channel' | 'chat' | 'privacy';
  private takeOut: (peerIds: number[]) => Promise<any> | any;
  private skippable: boolean;

  constructor(slider: SidebarSlider) {
    super(slider);
  }

  protected init() {
    this.nextBtn = Button('btn-corner btn-circle', {icon: 'arrow-next'});
    this.content.append(this.nextBtn);
    
    this.nextBtn.addEventListener('click', () => {
      const peerIds = this.selector.getSelected();

      if(this.skippable) {
        this.takeOut(peerIds);
        this.close();
      } else {
        const promise = this.takeOut(peerIds);

        if(promise instanceof Promise) {
          this.nextBtn.classList.remove('tgico-arrow-next');
          this.nextBtn.disabled = true;
          putPreloader(this.nextBtn);
          this.selector.freezed = true;
  
          promise.then(() => {
            this.close();
          });
        } else {
          this.close();
        }
      }
    });
  }

  public onCloseAfterTimeout() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }
  }

  public open(options: {
    title: string,
    placeholder: string,
    peerId?: number, 
    type: AppAddMembersTab['peerType'], 
    takeOut?: AppAddMembersTab['takeOut'],
    skippable: boolean,
    selectedPeerIds?: number[]
  }) {
    const ret = super.open();

    this.title.innerHTML = options.title;
    this.peerType = options.type;
    this.takeOut = options.takeOut;
    this.skippable = options.skippable;

    this.onCloseAfterTimeout();
    this.selector = new AppSelectPeers(this.content, this.skippable ? null : (length) => {
      this.nextBtn.classList.toggle('is-visible', !!length);
    }, ['contacts']);
    this.selector.input.placeholder = options.placeholder;

    if(options.selectedPeerIds) {
      options.selectedPeerIds.forEach(peerId => {
        this.selector.add(peerId);
      });
    }

    this.nextBtn.classList.add('tgico-arrow-next');
    this.nextBtn.innerHTML = '';
    this.nextBtn.disabled = false;
    this.nextBtn.classList.toggle('is-visible', this.skippable);

    return ret;
  }
}