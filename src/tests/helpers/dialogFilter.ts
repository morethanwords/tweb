import type {MyDialogFilter} from '@lib/storages/filters';

/** A folder as the app keeps it, empty but for what a test gives it */
export default function makeDialogFilter(id: number, localId: number, fields?: Partial<MyDialogFilter>): MyDialogFilter {
  return {
    _: 'dialogFilter',
    pFlags: {},
    id,
    title: {_: 'textWithEntities', text: `Folder ${id}`, entities: []},
    pinned_peers: [],
    include_peers: [],
    exclude_peers: [],
    pinnedPeerIds: [],
    includePeerIds: [],
    excludePeerIds: [],
    localId,
    ...fields
  } as MyDialogFilter;
}
