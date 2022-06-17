/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import IS_SHARED_WORKER_SUPPORTED from "../../environment/sharedWorkerSupport";
import EventListenerBase from "../../helpers/eventListenerBase";
import idleController from "../../helpers/idleController";
import { nextRandomUint } from "../../helpers/random";
import { logger } from "../logger";
import rootScope from "../rootScope";
import sessionStorage from "../sessionStorage";

export type AppInstance = {
  id: number,
  idle: boolean,
  time: number
};

const CHECK_INSTANCE_INTERVAL = 5000; 
const DEACTIVATE_TIMEOUT = 30000;
const MULTIPLE_TABS_THRESHOLD = 20000;
const IS_MULTIPLE_INSTANCES_SUPPORTED = IS_SHARED_WORKER_SUPPORTED;

export class SingleInstance extends EventListenerBase<{
  activated: () =>  void,
  deactivated: () => void
}> {
  private instanceID: number;
  private started: boolean;
  private masterInstance: boolean;
  private deactivateTimeout: number;
  private deactivated: boolean;
  private initial: boolean;
  private log = logger('INSTANCE');

  public start() {
    if(!this.started && !IS_MULTIPLE_INSTANCES_SUPPORTED/*  && !Config.Navigator.mobile && !Config.Modes.packed */) {
      this.started = true;

      this.reset();
      //IdleManager.start();

      idleController.addEventListener('change', this.checkInstance);
      setInterval(this.checkInstance, CHECK_INSTANCE_INTERVAL);
      this.checkInstance();

      try {
        document.documentElement.addEventListener('beforeunload', this.clearInstance);
      } catch(e) {}
    }
  }

  private reset() {
    if(IS_MULTIPLE_INSTANCES_SUPPORTED) return;
    this.instanceID = nextRandomUint(32);
    this.masterInstance = false;
    if(this.deactivateTimeout) clearTimeout(this.deactivateTimeout);
    this.deactivateTimeout = 0;
    this.deactivated = false;
    this.initial = false;
  }

  private clearInstance = () => {
    if(this.masterInstance && !this.deactivated && !IS_MULTIPLE_INSTANCES_SUPPORTED) {
      this.log.warn('clear master instance');
      sessionStorage.delete('xt_instance');
    }
  };

  public activateInstance() {
    if(this.deactivated && !IS_MULTIPLE_INSTANCES_SUPPORTED) {
      this.reset();
      this.checkInstance(false);
      this.dispatchEvent('activated');
    }
  }

  private deactivateInstance = () => {
    if(this.masterInstance || this.deactivated || IS_MULTIPLE_INSTANCES_SUPPORTED) {
      return;
    }

    this.log('deactivate');
    this.deactivateTimeout = 0;
    this.deactivated = true;
    this.clearInstance();
    //$modalStack.dismissAll();

    //document.title = _('inactive_tab_title_raw')

    idleController.idle.deactivated = true;
    this.dispatchEvent('deactivated');
  };

  private checkInstance = (idle = idleController.idle?.isIDLE) => {
    if(this.deactivated || IS_MULTIPLE_INSTANCES_SUPPORTED) {
      return;
    }
    
    const time = Date.now();
    const newInstance: AppInstance = {
      id: this.instanceID, 
      idle, 
      time
    };

    sessionStorage.get('xt_instance', false).then((curInstance: AppInstance) => {
      // this.log('check instance', newInstance, curInstance)
      if(!idle ||
          !curInstance ||
          curInstance.id === this.instanceID ||
          curInstance.time < (time - MULTIPLE_TABS_THRESHOLD)) {
        sessionStorage.set({xt_instance: newInstance});

        if(!this.masterInstance) {
          rootScope.managers.networkerFactory.startAll();
          if(!this.initial) {
            this.initial = true;
          } else {
            this.log.warn('now master instance', newInstance);
          }

          this.masterInstance = true;
        }

        if(this.deactivateTimeout) {
          clearTimeout(this.deactivateTimeout);
          this.deactivateTimeout = 0;
        }
      } else {
        if(this.masterInstance) {
          rootScope.managers.networkerFactory.stopAll();
          this.log.warn('now idle instance', newInstance);
          if(!this.deactivateTimeout) {
            this.deactivateTimeout = window.setTimeout(this.deactivateInstance, DEACTIVATE_TIMEOUT);
          }

          this.masterInstance = false;
        }
      }
    });
  };
}

const singleInstance = new SingleInstance();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.singleInstance = singleInstance);
export default singleInstance;
