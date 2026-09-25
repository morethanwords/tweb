import {forgetLoadedURL} from '@helpers/dom/loadedUrlCache';
import {isObjectURL} from '@helpers/objectUrlUtils';

export function createObjectURL(blob: Blob) {
  return URL.createObjectURL(blob);
}

// Local previews must be disposed even when shared worker URL revocation is
// disabled. Forget their decoded-load cache entries at the same time.
export function revokeObjectURL(url: string) {
  if(isObjectURL(url)) {
    forgetLoadedURL(url);
    URL.revokeObjectURL(url);
  }
}

export class ObjectURLScope {
  private urls = new Set<string>();

  public create(blob: Blob) {
    return this.add(createObjectURL(blob));
  }

  public add(url: string) {
    if(isObjectURL(url)) {
      this.urls.add(url);
    }
    return url;
  }

  public release(url: string) {
    if(this.urls.delete(url)) {
      revokeObjectURL(url);
    }
  }

  public dispose() {
    for(const url of this.urls) {
      revokeObjectURL(url);
    }
    this.urls.clear();
  }
}
