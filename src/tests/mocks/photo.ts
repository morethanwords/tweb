import type {Photo} from '@layer';

/** A photo as the server describes one, told apart by its id */
export default function makePhoto(id: number): Photo.photo {
  return {
    _: 'photo',
    id: String(id),
    access_hash: String(id + 100),
    file_reference: new Uint8Array([id])
  } as Photo.photo;
}
