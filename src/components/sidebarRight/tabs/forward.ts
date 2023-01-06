/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export {};

// export default class AppForwardTab implements SliderTab {
//   public container: HTMLElement;
//   public closeBtn: HTMLElement;
//   private sendBtn: HTMLButtonElement;

//   private selector: AppSelectPeers;
//   private mids: number[] = [];

//   onCloseAfterTimeout() {
//     document.body.classList.remove('is-forward-active');
//     this.cleanup();
//   }

//   public cleanup() {
//     if(this.selector) {
//       this.selector.container.remove();
//       this.selector = null;
//     }

//     this.sendBtn.innerHTML = '';
//     this.sendBtn.classList.add('tgico-send');
//     this.sendBtn.classList.remove('is-visible');
//     this.sendBtn.disabled = false;
//   }

//   public init() {
//     this.container = document.getElementById('forward-container') as HTMLDivElement;
//     this.closeBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
//     this.sendBtn = this.container.querySelector('.btn-circle') as HTMLButtonElement;

//     this.sendBtn.addEventListener('click', () => {
//       let peerIds = this.selector.getSelected().map((s) => s.toPeerId());

//       if(this.mids.length && peerIds.length) {
//         this.sendBtn.classList.remove('tgico-send');
//         this.sendBtn.disabled = true;
//         putPreloader(this.sendBtn);
//         this.selector.freezed = true;

//         let s = () => {
//           let promises = peerIds.splice(0, 3).map((peerId) => {
//             return appMessagesManager.forwardMessages(peerId, NULL_PEER_ID, this.mids);
//           });

//           Promise.all(promises).then(() => {
//             if(peerIds.length) {
//               return s();
//             } else {
//               this.closeBtn.click();
//             }
//           });
//         };

//         s();
//       }
//     });
//   }

//   public open(ids: number[]) {
//     if(this.init) {
//       this.init();
//       this.init = null;
//     }

//     this.cleanup();
//     this.mids = ids;

//     // this.selector = new AppSelectPeers({
//     //   appendTo: this.container,
//     //   onChange: (length) => {
//     //     this.sendBtn.classList.toggle('is-visible', !!length);
//     //   },
//     //   peerType: ['dialogs', 'contacts'],
//     //   onFirstRender: () => {
//     //     //console.log('forward rendered:', this.container.querySelector('.selector ul').childElementCount);

//     //     // !!!!!!!!!! UNCOMMENT BELOW IF NEED TO USE THIS CLASS
//     //     ////////////////////////////////////////appSidebarRight.selectTab(AppSidebarRight.SLIDERITEMSIDS.forward);
//     //     appSidebarRight.toggleSidebar(true).then(() => {
//     //       if(this.selector) {
//     //         this.selector.checkForTriggers();
//     //       }
//     //     });
//     //     document.body.classList.add('is-forward-active');
//     //   },
//     //   chatRightsAction: 'send_messages'
//     // });
//   }
// }
