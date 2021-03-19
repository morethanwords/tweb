import Scrollable from "../components/scrollable";

export default class ScrollableLoader {
  constructor(options: {
    scrollable: Scrollable,
    getPromise: () => Promise<any>
  }) {
    let loading = false;
    options.scrollable.onScrolledBottom = () => {
      if(loading) {
        return;
      }

      loading = true;
      options.getPromise().then(done => {
        loading = false;

        if(done) {
          options.scrollable.onScrolledBottom = null;
        } else {
          options.scrollable.checkForTriggers();
        }
      }, () => {
        loading = false;
      });
    };
  }
}
