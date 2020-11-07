import Page from "./page";
import { whichChild } from "../helpers/dom";
import lottieLoader from "../lib/lottieLoader";
import { horizontalMenu } from "../components/horizontalMenu";
import { MOUNT_CLASS_TO } from "../lib/mtproto/mtproto_config";

class PagesManager {
  private pageID = -1;
  private page: Page;

  private selectTab: ReturnType<typeof horizontalMenu>;
  public pagesDiv: HTMLDivElement;

  constructor() {
    this.pagesDiv = document.getElementById('auth-pages') as HTMLDivElement;
    this.selectTab = horizontalMenu(null, this.pagesDiv.firstElementChild.firstElementChild as HTMLDivElement, null, () => {
      if(this.page.onShown) {
        this.page.onShown();
      }
    });
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

    this.page = page;
  }
}

const pagesManager = new PagesManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.pagesManager = pagesManager);
export default pagesManager;