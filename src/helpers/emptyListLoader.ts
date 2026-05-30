import ListLoader from '@helpers/listLoader';

export default class EmptyListLoader<T> extends ListLoader<T, any> {
  constructor() {
    super({
      loadMore: () => {
        return Promise.resolve({count: 0, items: []});
      }
    });

    this.loadedAllDown = true;
    this.loadedAllUp = true;
  }
}
