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

      if(this.pageID != -1 && id > 1) {
        lottieLoader.loadLottieWorkers();
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
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).pagesManager = pagesManager;
}
export default pagesManager;