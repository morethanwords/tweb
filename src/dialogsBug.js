MTProto.apiManager.invokeApi('messages.getPeerDialogs', {
    peers: [
        {
            _: 'inputDialogPeer',
            peer: {_: 'inputPeerUser', user_id: 296814355, access_hash: '7461657386624868366'}
}
]
}).then(dialogs => console.log(dialogs));

MTProto.apiManager.invokeApi('messages.getPinnedDialogs', {
  folder_id: 0
}).then(dialogs => console.log(dialogs));

// read_outbox_max_id && read_inbox_max_id are 0!
MTProto.apiManager.invokeApi('messages.getDialogs', {
  flags: 0 | 1,
  exclude_pinned: true,
  folder_id: 0,
  offset_date: 0,
  offset_id: 0,
  offset_peer: {_: 'inputPeerEmpty'},
  limit: 6,
  hash: Date.now() * 5
}).then(dialogs => console.log(dialogs));

// [109, 188, 177, 157, 19, 7, 177, 17, 49, 155, 9, 0, 44, 155, 9, 0, 237, 154, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 157, 80, 175]  - works
// [109, 188, 177, 157, 19, 7, 177, 17, 49, 155, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 157, 80, 175]  - pinned

