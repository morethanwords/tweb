import { CancellablePromise } from "../helpers/cancellablePromise";
import ProgressivePreloader from "./preloader";

export default class Loader {
  public preloader: ProgressivePreloader;

  constructor(private options: {
    dialogType?: 'contact' | 'private' | 'group' | 'channel',
    getPromise: () => CancellablePromise<any>,
    middleware: () => boolean,
    appendTo: HTMLElement,
    preloader?: ProgressivePreloader,
    isUpload?: boolean
  }) {
    this.preloader = options.preloader || new ProgressivePreloader({
      cancelable: false,
      attachMethod: 'prepend'
    });

  }

  public init() {
    
  }

  public load() {
    


  }
}