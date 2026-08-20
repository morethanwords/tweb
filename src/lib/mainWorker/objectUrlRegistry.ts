import {isObjectURL, type ObjectURLPinUpdate} from '@helpers/objectUrlUtils';
import ObjectUrlCacheBudget from '@lib/mainWorker/objectUrlCacheBudget';
import Modes from '@config/modes';

export type ObjectUrlOwner = string;

type ObjectUrlApi = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;

type ObjectUrlEntry = {
  graceTimer?: ReturnType<typeof setTimeout>,
  owners: Set<ObjectUrlOwner>,
  pins: number,
  size: number
};

// * A URL that lost its last owner and pin is revoked only after a grace
// * period: a tab may still hold the string (mid-delivery or mid-render).
export const OBJECT_URL_GRACE_TTL = 30e3;
const OBJECT_URL_GRACE_BYTES_LIMIT = 128 * 1024 * 1024;
const OBJECT_URL_GRACE_LIMIT = 256;

export class ObjectUrlRegistry {
  private entries = new Map<string, ObjectUrlEntry>();
  private activeSources = new Set<MessageEventSource>();
  private graceBudget = new ObjectUrlCacheBudget<string>(
    OBJECT_URL_GRACE_LIMIT,
    OBJECT_URL_GRACE_BYTES_LIMIT
  );
  private pinsBySource = new Map<MessageEventSource, Map<string, number>>();
  private urlByOwner = new Map<ObjectUrlOwner, string>();

  constructor(
    private urlApi: ObjectUrlApi = URL,
    private graceTTL = OBJECT_URL_GRACE_TTL
  ) {
  }

  public createShared(blob: Blob, owner: ObjectUrlOwner) {
    const url = this.urlApi.createObjectURL(blob);
    this.setSharedOwnerURL(owner, url, blob.size);
    return url;
  }

  public setSharedOwnerURL(owner: ObjectUrlOwner, url: string, size = 0) {
    const previousUrl = this.urlByOwner.get(owner);
    if(previousUrl === url) {
      const entry = this.entries.get(url);
      if(entry) {
        entry.size = Math.max(entry.size, size);
      }
      return;
    }

    if(isObjectURL(url)) {
      let entry = this.entries.get(url);
      if(!entry) {
        this.entries.set(url, entry = {owners: new Set(), pins: 0, size});
      }
      entry.size = Math.max(entry.size, size);
      entry.owners.add(owner);
      this.cancelGrace(url, entry);
      this.urlByOwner.set(owner, url);
    } else {
      this.urlByOwner.delete(owner);
    }

    if(previousUrl) {
      this.removeOwner(previousUrl, owner);
    }
  }

  public getSharedOwnerURL(owner: ObjectUrlOwner) {
    return this.urlByOwner.get(owner);
  }

  public getURLSize(url: string) {
    return this.entries.get(url)?.size;
  }

  // * Blob bytes live in this process until the browser pulls them, so a registry holding
  // * thousands of URLs is a first-class suspect in a tab's footprint - see memoryStats.
  public getStats() {
    let bytes = 0, pinned = 0, pinnedBytes = 0, inGrace = 0, ownerless = 0;
    for(const entry of this.entries.values()) {
      bytes += entry.size;
      if(entry.pins) {
        ++pinned;
        pinnedBytes += entry.size;
      }

      if(entry.graceTimer !== undefined) ++inGrace;
      if(!entry.owners.size) ++ownerless;
    }

    return {
      urls: this.entries.size,
      urlBytes: bytes,
      pinnedURLs: pinned,
      pinnedBytes,
      urlsInGrace: inGrace,
      ownerlessURLs: ownerless,
      pinningTabs: this.pinsBySource.size
    };
  }

  public hasOwners(url: string) {
    return !!this.entries.get(url)?.owners.size;
  }

  public releaseSharedOwnerURL(owner: ObjectUrlOwner) {
    const url = this.urlByOwner.get(owner);
    if(!url) {
      return false;
    }

    this.urlByOwner.delete(owner);
    this.removeOwner(url, owner);
    return true;
  }

  public registerSource(source: MessageEventSource) {
    this.activeSources.add(source);
  }

  public updateObjectURLPins(
    updates: ObjectURLPinUpdate[],
    source: MessageEventSource
  ) {
    if(!this.activeSources.has(source)) {
      return;
    }

    for(const {url, active} of updates) {
      if(active) {
        this.pin(source, url);
      } else {
        this.unpin(source, url);
      }
    }
  }

  public releaseSource(source: MessageEventSource) {
    this.activeSources.delete(source);
    const pins = this.pinsBySource.get(source);
    if(!pins) {
      return;
    }

    this.pinsBySource.delete(source);
    for(const [url, count] of pins) {
      const entry = this.entries.get(url);
      if(entry) {
        entry.pins = Math.max(0, entry.pins - count);
        this.scheduleGraceIfUnused(url, entry);
      }
    }
  }

  public dispose() {
    for(const url of [...this.entries.keys()]) {
      this.revoke(url);
    }
    this.urlByOwner.clear();
    this.activeSources.clear();
    this.graceBudget.clear();
    this.pinsBySource.clear();
  }

  private pin(source: MessageEventSource, url: string) {
    const entry = this.entries.get(url);
    if(!entry) {
      return;
    }

    const pins = this.pinsBySource.get(source) ?? new Map<string, number>();
    pins.set(url, (pins.get(url) || 0) + 1);
    this.pinsBySource.set(source, pins);
    entry.pins++;
    this.cancelGrace(url, entry);
  }

  private unpin(source: MessageEventSource, url: string) {
    const pins = this.pinsBySource.get(source);
    const count = pins?.get(url);
    if(!count) {
      return;
    }

    if(count === 1) {
      pins.delete(url);
      if(!pins.size) {
        this.pinsBySource.delete(source);
      }
    } else {
      pins.set(url, count - 1);
    }

    const entry = this.entries.get(url);
    if(entry) {
      entry.pins = Math.max(0, entry.pins - 1);
      this.scheduleGraceIfUnused(url, entry);
    }
  }

  private removeOwner(url: string, owner: ObjectUrlOwner) {
    const entry = this.entries.get(url);
    if(!entry) {
      return;
    }

    entry.owners.delete(owner);
    this.scheduleGraceIfUnused(url, entry);
  }

  private scheduleGraceIfUnused(url: string, entry: ObjectUrlEntry) {
    // * the kill switch stops here: no grace timer means nothing is ever
    // * revoked, neither by TTL nor by grace-budget overflow
    if(Modes.noObjectUrlRevoke) {
      return;
    }

    if(entry.owners.size || entry.pins || entry.graceTimer !== undefined) {
      return;
    }

    entry.graceTimer = setTimeout(() => this.revoke(url), this.graceTTL);
    const evicted = this.graceBudget.set(url, url, entry.size);
    for(const {key} of evicted) {
      if(key !== url) {
        this.revoke(key);
      }
    }
  }

  private cancelGrace(url: string, entry: ObjectUrlEntry) {
    if(entry.graceTimer !== undefined) {
      clearTimeout(entry.graceTimer);
      entry.graceTimer = undefined;
      this.graceBudget.delete(url);
    }
  }

  private revoke(url: string) {
    const entry = this.entries.get(url);
    if(!entry) {
      return;
    }

    this.entries.delete(url);
    this.cancelGrace(url, entry);
    for(const owner of entry.owners) {
      if(this.urlByOwner.get(owner) === url) {
        this.urlByOwner.delete(owner);
      }
    }
    this.urlApi.revokeObjectURL(url);
  }
}

const objectUrlRegistry = new ObjectUrlRegistry();
export default objectUrlRegistry;
