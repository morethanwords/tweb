import { MOUNT_CLASS_TO } from "../../config/debug";
import { nextRandomInt } from "../../helpers/random";
import { logger } from "../logger";
import rootScope from "../rootScope";
import sessionStorage from "../sessionStorage";

export type AppInstance = {
  id: number,
  idle: boolean,
  time: number
};

export class SingleInstance {
  private instanceID = nextRandomInt(0xFFFFFFFF);
  private started = false;
  private masterInstance = false;
  private deactivateTimeout: number = 0;
  private deactivated = false;
  private initial = false;
  private log = logger('SI');

  public start() {
    if(!this.started/*  && !Config.Navigator.mobile && !Config.Modes.packed */) {
      this.started = true

      //IdleManager.start();

      rootScope.addEventListener('idle', this.checkInstance);
      setInterval(this.checkInstance, 5000);
      this.checkInstance();

      try {
        document.documentElement.addEventListener('beforeunload', this.clearInstance);
      } catch(e) {}
    }
  }

  public clearInstance() {
    if(this.masterInstance && !this.deactivated) {
      this.log.warn('clear master instance');
      sessionStorage.delete('xt_instance');
    }
  }

  public deactivateInstance = () => {
    if(this.masterInstance || this.deactivated) {
      return false;
    }

    this.log('deactivate');
    this.deactivateTimeout = 0;
    this.deactivated = true;
    this.clearInstance();
    //$modalStack.dismissAll();

    //document.title = _('inactive_tab_title_raw')

    rootScope.idle.deactivated = true;
  };

  public checkInstance = () => {
    if(this.deactivated) {
      return false;
    }
    
    const time = Date.now();
    const idle = rootScope.idle && rootScope.idle.isIDLE;
    const newInstance: AppInstance = {
      id: this.instanceID, 
      idle, 
      time
    };

    sessionStorage.get('xt_instance').then((curInstance: AppInstance) => {
      // console.log(dT(), 'check instance', newInstance, curInstance)
      if(!idle ||
          !curInstance ||
          curInstance.id == this.instanceID ||
          curInstance.time < time - 20000) {
        sessionStorage.set({xt_instance: newInstance});
        if(!this.masterInstance) {
          //MtpNetworkerFactory.startAll();
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
          //MtpNetworkerFactory.stopAll();
          this.log.warn('now idle instance', newInstance);
          if(!this.deactivateTimeout) {
            this.deactivateTimeout = window.setTimeout(this.deactivateInstance, 30000);
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
