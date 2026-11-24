/** A set of stickers as the server describes one, the fields a test cares about given as overrides */
export default function makeStickerSet(id: string, fields: Record<string, any> = {}): any {
  return {
    _: 'stickerSet',
    id,
    access_hash: '1',
    title: 'Set ' + id,
    short_name: 'set' + id,
    count: 1,
    pFlags: {},
    ...fields
  };
}
