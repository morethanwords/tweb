import Scrollable from "../components/scrollable";

export default class ScrollableLoader {
  public loading = false;
  private scrollable: Scrollable;
  private getPromise: () => Promise<any>;
  private promise: Promise<any>;
  private loaded = false;

  constructor(options: {
    scrollable: ScrollableLoader['scrollable'],
    getPromise: ScrollableLoader['getPromise']
  }) {
    Object.assign(this, options);

    options.scrollable.onScrolledBottom = () => {
      this.load();
    };
  }
  
  public load() {
    if(this.loaded) {
      return Promise.resolve();
    }
    
    if(this.loading) {
      return this.promise;
    }

    this.loading = true;
    this.promise = this.getPromise().then(done => {
      this.loading = false;
      this.promise = undefined;

      if(done) {
        this.loaded = true;
        this.scrollable.onScrolledBottom = null;
      } else {
        this.scrollable.checkForTriggers();
      }
    }, () => {
      this.promise = undefined;
      this.loading = false;
    });
  }
}
