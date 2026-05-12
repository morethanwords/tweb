import ListLoader from '@helpers/listLoader';

export default class EmptyListLoader<T> extends ListLoader<T, any> {
  constructor() {
    super({
      loadMore: () => {
        return Promise.resolve({count: 0, items: []}); // ! это значит, что открыло аватар чата, но следующих фотографий нет.
      }
    });

    this.loadedAllDown = true;
    this.loadedAllUp = true;
  }
}
