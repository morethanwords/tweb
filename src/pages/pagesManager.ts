import Page from "./page";
import { whichChild } from "../lib/utils";
import { horizontalMenu } from "../components/misc";
import lottieLoader from "../lib/lottieLoader";

class PagesManager {
  private pageID = -1;

  private selectTab: ReturnType<typeof horizontalMenu>;
  public pagesDiv: HTMLDivElement;

  constructor() {
    this.pagesDiv = document.getElementById('auth-pages') as HTMLDivElement;
    this.selectTab = horizontalMenu(null, this.pagesDiv.firstElementChild as HTMLDivElement, null, null, 420);
  }

  public setPage(page: Page) {
    if(page.isAuthPage) {
      this.pagesDiv.style.display = '';

      let id = whichChild(page.pageEl);
      if(this.pageID == id) return;

      this.selectTab(id);

      // это нужно чтобы ресайзнуть канвас (из-за скрытого рендера будет 0х0)
      if(this.pageID != -1) {
        lottieLoader.loadLottie().then(() => {
          // @ts-ignore
          lottieLoader.lottie.resize();
        });
      }

      this.pageID = id;
    } else {
      this.pagesDiv.style.display = 'none';
      page.pageEl.style.display = '';

      this.pageID = -1;
    }
  }
}

const pagesManager = new PagesManager();
(window as any).pagesManager = pagesManager;
export default pagesManager;