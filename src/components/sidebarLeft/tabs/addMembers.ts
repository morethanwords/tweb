import SidebarSlider, { SliderSuperTab } from "../../slider";
import AppSelectPeers from "../../appSelectPeers";
import { putPreloader } from "../../misc";
import Button from "../../button";
import { fastRaf } from "../../../helpers/schedulers";

export default class AppAddMembersTab extends SliderSuperTab {
  private nextBtn: HTMLButtonElement;
  private selector: AppSelectPeers;
  private peerType: 'channel' | 'chat' | 'privacy';
  private takeOut: (peerIds: number[]) => Promise<any> | any;
  private skippable: boolean;

  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.nextBtn = Button('btn-corner btn-circle', {icon: 'arrow_next'});
    this.content.append(this.nextBtn);
    
    this.nextBtn.addEventListener('click', () => {
      const peerIds = this.selector.getSelected();

      if(this.skippable) {
        this.takeOut(peerIds);
        this.close();
      } else {
        const promise = this.takeOut(peerIds);

        if(promise instanceof Promise) {
          this.nextBtn.classList.remove('tgico-arrow_next');
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

    this.selector = new AppSelectPeers({
      appendTo: this.content, 
      onChange: this.skippable ? null : (length) => {
        this.nextBtn.classList.toggle('is-visible', !!length);
      }, 
      peerType: ['contacts']
    });
    this.selector.input.placeholder = options.placeholder;

    if(options.selectedPeerIds) {
      fastRaf(() => {
        this.selector.addInitial(options.selectedPeerIds);
      });
    }

    this.nextBtn.classList.add('tgico-arrow_next');
    this.nextBtn.innerHTML = '';
    this.nextBtn.disabled = false;
    this.nextBtn.classList.toggle('is-visible', this.skippable);

    return ret;
  }
}