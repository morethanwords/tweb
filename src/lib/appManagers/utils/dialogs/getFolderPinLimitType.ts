import {FOLDER_ID_ARCHIVE} from '@appManagers/constants';

/** Which limit a real folder's pins are held to: the archive's own, or the main list's */
export default function getFolderPinLimitType(folderId: number): 'folderPin' | 'pin' {
  return folderId === FOLDER_ID_ARCHIVE ? 'folderPin' : 'pin';
}
