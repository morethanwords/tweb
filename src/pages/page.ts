import pagesManager from "./pagesManager";

export default class Page {
  public pageEl: HTMLDivElement;
  private installed = false;

  constructor(className: string, public isAuthPage: boolean, private onFirstMount?: (...args: any[]) => void, private onMount?: (...args: any[]) => void) {
    this.pageEl = document.body.getElementsByClassName(className)[0] as HTMLDivElement;
  }

  public mount(...args: any[]) {
    //this.pageEl.style.display = '';

    if(this.onMount) {
      this.onMount(...args);
    }

    if(!this.installed) {
      if(this.onFirstMount) {
        this.onFirstMount(...args);
      }
      
      this.installed = true;
    }

    pagesManager.setPage(this);
  }
}