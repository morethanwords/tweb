import {Document, InputDocument, UserFull} from '@layer';
import {AppManager} from '@appManagers/manager';
import {MyDocument} from '@appManagers/appDocsManager';
import getDocumentInput from '@appManagers/utils/docs/getDocumentInput';
import {ReferenceContext} from '@lib/storages/references';
import countHash from '@helpers/long/countHash';
import assumeType from '@helpers/assumeType';

export type SavedMusicPage = {
  count: number,
  documents: MyDocument[]
};

// The ids list is only re-polled after this long — it exists to answer "is this track already in my
// profile?", and every mutation made from this client keeps it up to date locally anyway.
const RELOAD_IDS_EVERY = 30e3;

/**
 * Owns the "saved music" (profile playlist) domain: paging over someone's playlist, the set of ids
 * that are in MY playlist, and the add / remove / reorder mutations behind `account.saveMusic`.
 *
 * Mutations update the local state optimistically and dispatch `saved_music_update` so open lists
 * re-read; a failure rolls the local state back.
 */
export default class AppSavedMusicManager extends AppManager {
  private myIds: DocId[];
  private myIdsSet: Set<DocId>;
  private myIdsPromise: Promise<DocId[]>;
  private myIdsReceivedAt: number;
  private firstPages: Map<UserId, SavedMusicPage>;
  // Last `saved_music` seen on each user's userFull — the server only sends the top track, so a
  // change to it is the signal that the playlist was modified elsewhere.
  private lastTopDocId: Map<UserId, DocId>;

  protected after() {
    this.clear(true);
  }

  public clear = (init?: boolean) => {
    this.myIds = undefined;
    this.myIdsSet = undefined;
    this.myIdsPromise = undefined;
    this.myIdsReceivedAt = 0;
    this.firstPages = new Map();
    this.lastTopDocId = new Map();
  };

  // Per-document, so a stale file_reference can be refreshed by asking for that exact track
  // instead of re-reading a page it may not even be on.
  private saveDocs(userId: UserId, documents: Document[]) {
    return documents
    .map((doc) => this.appDocsManager.saveDoc(doc, {type: 'savedMusic', userId, docId: doc.id} as ReferenceContext))
    .filter(Boolean);
  }

  public async getSavedMusic(userId: UserId, offset: number = 0, limit: number = 50): Promise<SavedMusicPage> {
    const cached = offset === 0 ? this.firstPages.get(userId) : undefined;
    const result = await this.apiManager.invokeApi('users.getSavedMusic', {
      id: this.appUsersManager.getUserInput(userId),
      offset,
      limit,
      hash: cached ? countHash(cached.documents.slice(0, limit).map((doc) => doc.id)) : 0
    });

    if(result._ === 'users.savedMusicNotModified') {
      return cached ?? {count: result.count, documents: []};
    }

    const page: SavedMusicPage = {count: result.count, documents: this.saveDocs(userId, result.documents)};
    if(offset === 0) {
      this.firstPages.set(userId, page);
    }

    return page;
  }

  /**
   * Looks tracks up by id, carrying whatever file_reference we currently hold — this is the call
   * that hands back a fresh reference for a track that page 0 would never reach.
   */
  public async getSavedMusicByIds(userId: UserId, docIds: DocId[]) {
    const documents = docIds
    .map((docId) => this.appDocsManager.getDoc(docId))
    .filter(Boolean)
    .map((doc) => getDocumentInput(doc));

    if(!documents.length) {
      return [];
    }

    const result = await this.apiManager.invokeApi('users.getSavedMusicByID', {
      id: this.appUsersManager.getUserInput(userId),
      documents
    });

    if(result._ === 'users.savedMusicNotModified') {
      return [];
    }

    return this.saveDocs(userId, result.documents);
  }

  public getMyIds(overwrite?: boolean): MaybePromise<DocId[]> {
    if(this.myIds && !overwrite && (Date.now() - this.myIdsReceivedAt) < RELOAD_IDS_EVERY) {
      return this.myIds;
    }

    return this.myIdsPromise ??= this.apiManager.invokeApiSingle('account.getSavedMusicIds', {
      hash: this.myIds ? countHash(this.myIds) : 0
    }).then((result) => {
      if(result._ === 'account.savedMusicIds') {
        this.setMyIds(result.ids);
      }

      this.myIdsReceivedAt = Date.now();
      return this.myIds ?? [];
    }).catch(() => {
      // Treat a failed poll as "nothing known yet" rather than retrying in a loop — the next
      // lookup after the throttle window will try again.
      this.myIdsReceivedAt = Date.now();
      return this.myIds ?? [];
    }).finally(() => {
      this.myIdsPromise = undefined;
    });
  }

  private setMyIds(ids: DocId[]) {
    this.myIds = ids;
    this.myIdsSet = new Set(ids);
  }

  public async isInProfile(docId: DocId) {
    await this.getMyIds();
    return !!this.myIdsSet?.has(docId);
  }

  /**
   * `account.saveMusic` with a file_reference retry: the reference carried by a document found in
   * an old message can be stale, and refreshing it mutates the document in place, so the retry just
   * re-reads the input.
   */
  private async invokeSaveMusic(doc: MyDocument, params: {unsave?: true, after_id?: InputDocument}) {
    const send = () => this.apiManager.invokeApi('account.saveMusic', {
      ...params,
      id: getDocumentInput(doc)
    });

    try {
      return await send();
    } catch(err) {
      assumeType<ApiError>(err);
      if(err.type !== 'FILE_REFERENCE_EXPIRED' && err.type !== 'FILE_REFERENCE_INVALID') {
        throw err;
      }

      await this.referencesStorage.refreshReference(doc.file_reference);
      return await send();
    }
  }

  public async saveMusic(docId: DocId) {
    const doc = this.appDocsManager.getDoc(docId);
    if(!doc) {
      return false;
    }

    await this.getMyIds();
    if(this.myIdsSet?.has(docId)) {
      return true;
    }

    // The ids move now (that's what flips the menu entry), but the update waits for the server:
    // a listener reacts by re-reading the playlist, which would still be the old one until then.
    const revert = this.mutateMyIds((ids) => [docId, ...ids]);

    try {
      await this.invokeSaveMusic(doc, {});
      // a save always lands at the front, so this is the track the profile shows from now on
      this.applyMyTopSavedMusic(doc);
      return true;
    } catch(err) {
      revert();
      throw err;
    } finally {
      this.invalidateMyPlaylist();
    }
  }

  public async removeMusic(docId: DocId) {
    const doc = this.appDocsManager.getDoc(docId);
    if(!doc) {
      return false;
    }

    const revert = this.mutateMyIds((ids) => ids.filter((id) => id !== docId));

    try {
      await this.invokeSaveMusic(doc, {unsave: true});
      if(this.getKnownTopDocId() === docId) { // the profile was naming this one
        this.forgetMyTopSavedMusic();
      }

      return true;
    } catch(err) {
      revert();
      throw err;
    } finally {
      this.invalidateMyPlaylist();
    }
  }

  /**
   * Moves a track so it sits right after `afterDocId` (or first, when that is undefined) — matching
   * `account.saveMusic`'s `after_id` anchor. The caller already reordered its own view, so this
   * only syncs the ids cache and the server.
   */
  public async reorderMusic(docId: DocId, afterDocId?: DocId) {
    const doc = this.appDocsManager.getDoc(docId);
    const afterDoc = afterDocId !== undefined ? this.appDocsManager.getDoc(afterDocId) : undefined;
    if(!doc || (afterDocId !== undefined && !afterDoc)) {
      return false;
    }

    const revert = this.mutateMyIds((ids) => {
      const without = ids.filter((id) => id !== docId);
      const anchorIdx = afterDocId !== undefined ? without.indexOf(afterDocId) : -1;
      without.splice(anchorIdx + 1, 0, docId);
      return without;
    });

    try {
      await this.invokeSaveMusic(doc, {after_id: afterDoc ? getDocumentInput(afterDoc) : undefined});
      if(!afterDoc) { // dragged to the front — the profile's top track moved with it
        this.applyMyTopSavedMusic(doc);
      } else if(this.getKnownTopDocId() === docId) { // dragged the top away, its successor is the server's business
        this.forgetMyTopSavedMusic();
      }

      // Only a failure needs announcing — the caller already shows the new order, and rebuilding
      // its list from the server would just undo the drag it is animating.
      this.invalidateMyPlaylist(false);
      return true;
    } catch(err) {
      revert();
      this.invalidateMyPlaylist();
      throw err;
    }
  }

  private invalidateMyPlaylist(dispatch = true) {
    const userId = this.rootScope.myId.toUserId();
    this.firstPages.delete(userId);
    // Our optimistic ids are in OUR order, which isn't the server's — so the next poll should go
    // out rather than sit on a hash the server will never match.
    this.myIdsReceivedAt = 0;
    dispatch && this.dispatchUpdate(userId);
  }

  /** What the profile is currently showing as the top track — kept by every write below. */
  private getKnownTopDocId() {
    return this.lastTopDocId.get(this.rootScope.myId.toUserId());
  }

  /**
   * userFull carries the top track alone, and that is what the profile row renders. No userFull
   * arrives for a change we made ourselves, so a mutation has to write it: otherwise the row keeps
   * naming the track that used to be first — or stays absent after the very first save — until the
   * cached full peer expires.
   *
   * Which track that is comes from what the mutation did, never from `myIds`: the server returns
   * those ids in an order of its own, so the first of them is not the top of the playlist.
   */
  private applyMyTopSavedMusic(doc: MyDocument) {
    const userId = this.rootScope.myId.toUserId();
    // our own write must not read back as a change made somewhere else
    this.lastTopDocId.set(userId, doc.id);

    this.appProfileManager.modifyCachedFullUser(userId, (userFull) => {
      assumeType<UserFull.userFull>(userFull);
      if(userFull.saved_music?.id === doc.id) {
        return false;
      }

      userFull.saved_music = doc;
    });
  }

  /**
   * For the mutations that leave a top we cannot name — the one that was first is gone, and its
   * successor is only known to the server. Rather than guess, drop the cached profile so the next
   * read fetches it.
   */
  private forgetMyTopSavedMusic() {
    const userId = this.rootScope.myId.toUserId();
    this.lastTopDocId.delete(userId);
    this.appProfileManager.refreshFullPeer(userId.toPeerId(false));
  }

  private mutateMyIds(mutate: (ids: DocId[]) => DocId[]) {
    const previous = this.myIds;
    this.setMyIds(mutate(previous ?? []));
    return () => {
      previous ? this.setMyIds(previous) : this.clearMyIds();
    };
  }

  private clearMyIds() {
    this.myIds = undefined;
    this.myIdsSet = undefined;
    this.myIdsReceivedAt = 0;
  }

  private dispatchUpdate(userId: UserId = this.rootScope.myId.toUserId()) {
    this.rootScope.dispatchEvent('saved_music_update', {peerId: userId.toPeerId(false)});
  }

  /**
   * userFull only carries the TOP track of the playlist, so a change to it is what tells us the
   * playlist was modified — from another client, or by a save that bumped a track to the front.
   */
  public applyTopSavedMusic(userId: UserId, doc: Document.document | undefined) {
    // `has` rather than a truthy check: "we have never seen this user" and "this user has no saved
    // music" are different states, and conflating them swallows the first track someone adds.
    const known = this.lastTopDocId.has(userId);
    const previous = this.lastTopDocId.get(userId);
    const docId = doc?.id;
    if(known && previous === docId) {
      return;
    }

    this.lastTopDocId.set(userId, docId);
    if(!known) { // first time we see this user — nothing was rendered off an older value
      return;
    }

    this.firstPages.delete(userId);
    if(userId === this.rootScope.myId.toUserId()) {
      this.clearMyIds();
    }

    this.dispatchUpdate(userId);
  }
}
