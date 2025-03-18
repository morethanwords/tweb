/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {TabState} from '../mtproto/mtprotoworker';
import {MOUNT_CLASS_TO} from '../../config/debug';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';

type Tab = {
  source: MessageEventSource,
  state: TabState
};

export class AppTabsManager {
  private tabs: Map<Tab['source'], Tab>;

  constructor() {
    this.tabs = new Map();
  }

  public start() {
    const port = MTProtoMessagePort.getInstance<false>();

    port.addEventListener('tabState', (state, source) => {
      const tab = this.tabs.get(source);
      tab.state = state;

      this.onTabStateChange();

      port.invokeVoid('tabsUpdated', [...this.tabs.values()].map(({state}) => state));
    });
  }

  public onTabStateChange = () => {};

  public getTabs() {
    return [...this.tabs.values()].filter((tab) => !!tab.state);
  }

  public addTab(source: MessageEventSource) {
    const tab: Tab = {
      source,
      state: undefined
    };

    this.tabs.set(source, tab);
    this.onTabStateChange();
  }

  public deleteTab(source: MessageEventSource) {
    this.tabs.delete(source);
    this.onTabStateChange();
    MTProtoMessagePort.getInstance<false>().invokeVoid('tabsUpdated', [...this.tabs.values()].map(({state}) => state));
  }
}

const appTabsManager = new AppTabsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appTabsManager = appTabsManager);
export default appTabsManager;
