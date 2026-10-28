import appImManager from '@lib/appImManager';
import SidebarSlider from '@components/slider';
import mediaSizes, {ScreenSize} from '@helpers/mediaSizes';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMediaTab';
import {MOUNT_CLASS_TO} from '@config/debug';
import {TabManagers} from '@lib/managers';
import appNavigationController from '@components/appNavigationController';
import rootScope from '@lib/rootScope';
import {installColumnWidthsUpdater} from '@helpers/updateColumnWidths';
import installColumnResize from '@helpers/installColumnResize';
import animationIntersector from '@components/animationIntersector';
import {APP_TABS, RIGHT_COLUMN_ACTIVE_CLASSNAME} from '@lib/appColumns';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import noop from '@helpers/noop';


export class AppSidebarRight extends SidebarSlider {
  public sharedMediaTab: AppSharedMediaTab;
  private pendingOpening: object;
  private pendingSharedMediaTab: {tab: AppSharedMediaTab};
  // public rect: DOMRect;

  constructor() {
    super({
      sidebarEl: document.getElementById('column-right') as HTMLElement,
      canHideFirst: true,
      navigationType: 'right'
    });

    this.sidebarEl.inert = !document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME);
  }

  construct(managers: TabManagers) {
    this.managers = managers;

    mediaSizes.addEventListener('changeScreen', (from, to) => {
      if(to === ScreenSize.medium && from !== ScreenSize.mobile) {
        this.toggleSidebar(false);
      }
    });

    installColumnWidthsUpdater();
    installColumnResize({columnEl: this.sidebarEl, side: 'right'});
  }

  public createSharedMediaTab() {
    const tab = this.createTab(AppSharedMediaTab, false, true);
    tab.slider = this;
    // this.tabsContainer.prepend(tab.container);
    return tab;
  }

  public replaceSharedMediaTab(tab?: AppSharedMediaTab) {
    const pending = this.pendingSharedMediaTab = {tab};
    const shown = document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    // * a profile on screen gives its place only to a filled one, not to an empty column for as long as that takes:
    // * one whose chat got ready while the column was hidden, or one a chat below left unbuilt. Whatever is put up
    // * next overtakes it
    if(shown && tab && !tab.isLoaded && this.sharedMediaTab && this.sharedMediaTab !== tab) {
      tab.ensureLoaded().catch(noop).then(() => {
        if(this.pendingSharedMediaTab === pending) this.swapSharedMediaTab(tab);
      });
      return;
    }

    this.swapSharedMediaTab(tab);
    if(tab && shown) {
      tab.ensureLoaded();
    }
  }

  private swapSharedMediaTab(tab?: AppSharedMediaTab) {
    const previousTab = this.sharedMediaTab;
    if(previousTab) {
      const idx = this.historyTabIds.indexOf(previousTab);

      if(this._selectTab.getFrom() === previousTab.container) {
        this._selectTab.setFrom(tab?.container);
      }

      if(tab) {
        if(idx !== -1) {
          this.historyTabIds[idx] = tab;
        }

        const wasActive = previousTab.container.classList.contains('active');
        if(wasActive) {
          tab.container.classList.add('active');
        }

        if(previousTab.container.isConnected) {
          previousTab.container.replaceWith(tab.container);
        } else {
          // * the previous tab went with its chat before this one took its place: a chat opened over another
          // * is destroyed when a different peer is opened from the list, and the chat below may still be loading
          // * it. `replaceWith` on a detached node does nothing, and the column stayed open with no tab in it
          this.tabsContainer.prepend(tab.container);
        }
      } else {
        if(idx !== -1) {
          this.historyTabIds.splice(idx, 1);
        }

        previousTab.container.remove();
      }
    } else if(tab) {
      // both undefined means there is nothing to remove and nothing to mount — reaching for
      // `tab.container` here threw, and the throw aborted whatever peer change was running
      this.tabsContainer.prepend(tab.container);
    }

    this.sharedMediaTab = tab;
  }

  /** the column is shown, or an opening of it waits for its profile */
  public isShownOrOpening() {
    return !!this.pendingOpening || document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME);
  }

  public onCloseTab(id: number, animate: boolean, isNavigation?: boolean) {
    if(!this.historyTabIds.length) {
      this.toggleSidebar(false, animate);
    }

    super.onCloseTab(id, animate, isNavigation);
  }

  public hide() {
    // * hidden by anything (an account switch hides it directly): an opening still waiting for its profile is off.
    // * A profile waiting to be filled before it takes a shown one's place still does that once filled: unseen by
    // * then, while swapping it now would show it empty in the column on its way out
    this.pendingOpening = undefined;

    this.sidebarEl.inert = true;
    document.body.classList.remove(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    appNavigationController.removeByType('right');
    // The column is hidden with a transform (stays mounted), so pause any video
    // avatars playing inside it — the IntersectionObserver won't catch the move.
    animationIntersector.toggleVideosUnder(this.sidebarEl, true);
    rootScope.dispatchEventSingle('right_sidebar_toggle', false);
  }

  public reveal() {
    this.toggleSidebar(true);
  }

  public toggleSidebar(enable?: boolean, animate?: boolean): Promise<any> {
    const active = document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    // * an opening still waiting for its profile is overtaken by whatever is asked next - a close above all
    this.pendingOpening = undefined;
    let willChange: boolean;
    if(enable !== undefined) {
      if(enable) {
        if(!active) {
          willChange = true;
        }
      } else if(active) {
        willChange = true;
      }
    } else {
      willChange = true;
    }

    if(!willChange) return Promise.resolve();

    // * a chat opened while the column was hidden builds its profile after its first frame: the column does not slide
    // * in before the profile is there
    const tab = this.sharedMediaTab;
    if(!active && tab && !tab.isLoaded) {
      const pending = this.pendingOpening = {};
      return tab.ensureLoaded().catch(noop).then(() => {
        if(this.pendingOpening !== pending) return;
        this.pendingOpening = undefined;
        // * the chat was closed meanwhile: nothing to show
        if(!this.sharedMediaTab) return;
        // * another chat was opened meanwhile: its profile is what the column shows
        if(this.sharedMediaTab !== tab) return this.toggleSidebar(enable, animate);
        if(document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME) !== active) return;
        return this.applySidebarToggle(active, enable, animate);
      });
    }

    return this.applySidebarToggle(active, enable, animate);
  }

  private applySidebarToggle(active: boolean, enable: boolean, animate: boolean): Promise<any> {
    if(!active && !this.historyTabIds.length) {
      this.sharedMediaTab.open();
    }

    const animationPromise = appImManager.selectTab(active ? APP_TABS.CHAT : APP_TABS.PROFILE, animate);
    if(!enable) this.hide();
    else {
      document.body.classList.add(RIGHT_COLUMN_ACTIVE_CLASSNAME);
      this.sidebarEl.inert = false;
      if(!appNavigationController.findItemByType('right')) {
        this.pushNavigationItem(this.sharedMediaTab);
      }
      // Resume video avatars paused by a previous hide() (see toggleVideosUnder).
      animationIntersector.toggleVideosUnder(this.sidebarEl, false);
      rootScope.dispatchEventSingle('right_sidebar_toggle', true);
    }
    return animationPromise;
  }
}

// made once: a hot update keeps it and moves it onto the edited class (see @helpers/hotRegistry)
const appSidebarRight = new AppSidebarRight();
MOUNT_CLASS_TO.appSidebarRight = appSidebarRight;
registerHotReloadGuard({appSidebarRight});
export default appSidebarRight;

if(import.meta.hot) import.meta.hot.accept();
