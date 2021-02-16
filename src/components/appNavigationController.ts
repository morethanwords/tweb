import { MOUNT_CLASS_TO } from "../config/debug";
import { isSafari } from "../helpers/userAgent";

export type NavigationItem = {
  type: 'left' | 'right' | 'im' | 'chat' | 'popup' | 'media' | 'menu' | 'esg',
  onPop: (canAnimate: boolean) => boolean | void
};

export class AppNavigationController {
  private navigations: Array<NavigationItem> = [];
  private id = Date.now();

  constructor() {
    window.addEventListener('popstate', (e) => {
      console.log('popstate', e);

      const id: number = e.state;
      if(id !== this.id) {
        this.pushState();
        return;
      }

      const item = this.navigations.pop();
      if(!item) {
        this.pushState();
        return;
      }

      const good = item.onPop(isSafari ? false : undefined);
      console.log('[NC]: popstate, navigation:', item, this.navigations);
      if(good === false) {
        this.pushItem(item);
      }

      //this.pushState(); // * prevent adding forward arrow
    });

    this.pushState(); // * push init state
  }

  public back() {
    history.back();
  }

  public pushItem(item: NavigationItem) {
    this.navigations.push(item);
    console.log('[NC]: pushstate', item, this.navigations);
    this.pushState();
  }

  private pushState() {
    history.pushState(this.id, '');
  }

  public replaceState() {
    history.replaceState(this.id, '');
  }
}

const appNavigationController = new AppNavigationController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appNavigationController = appNavigationController);
export default appNavigationController;
