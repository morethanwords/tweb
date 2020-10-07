import pagesManager from "./pagesManager";

export default class Page {
  public pageEl: HTMLDivElement;
  private installed = false;

  constructor(className: string, public isAuthPage: boolean, private onFirstMount?: (...args: any[]) => Promise<any> | void, private onMount?: (...args: any[]) => void, public onShown?: () => void) {
    this.pageEl = document.body.getElementsByClassName(className)[0] as HTMLDivElement;
  }

  public async mount(...args: any[]) {
    //this.pageEl.style.display = '';

    if(this.onMount) {
      this.onMount(...args);
    }

    if(!this.installed) {
      if(this.onFirstMount) {
        try {
          const res = this.onFirstMount(...args);
          if(res instanceof Promise) {
            await res;
          }
        } catch(err) {
          console.error('PAGE MOUNT ERROR:', err);
        }
      }
      
      this.installed = true;
    }

    pagesManager.setPage(this);
  }
}