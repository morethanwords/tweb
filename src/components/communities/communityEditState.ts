import type {CommunityAddMode} from '@appManagers/utils/communities/communityAddMode';

export const COMMUNITY_TITLE_MAX_LENGTH = 128;

export type CommunityEditState = {
  title: string,
  savedTitle: string,
  mode: CommunityAddMode,
  savedMode: CommunityAddMode,
  hasAvatarPreview: boolean
};

export type CommunityEditPermissions = {
  canEditInfo: boolean,
  canManageChats: boolean
};

export function hasCommunityEditChanges(
  options: CommunityEditState & CommunityEditPermissions
) {
  return (
    options.canEditInfo &&
    (
      options.title.trim() !== options.savedTitle ||
      options.hasAvatarPreview
    )
  ) || (
    options.canManageChats &&
    options.mode !== options.savedMode
  );
}

export function canSaveCommunityEdit(
  options: CommunityEditState & CommunityEditPermissions & {saving: boolean}
) {
  return hasCommunityEditChanges(options) &&
    (!options.canEditInfo || !!options.title.trim()) &&
    !options.saving;
}

export type CommunityAvatarUpload<TFile> = {
  file: TFile,
  video?: TFile,
  videoStartTs?: number
};

export async function saveCurrentCommunityAvatar<TFile>(options: {
  getPayload: () => {
    file: () => Promise<TFile>,
    video?: () => Promise<TFile>,
    videoStartTs?: number
  } | undefined,
  save: (upload: CommunityAvatarUpload<TFile>) => Promise<unknown>,
  clear: () => void
}) {
  const payload = options.getPayload();
  if(!payload) {
    return;
  }

  const [file, video] = await Promise.all([
    payload.file(),
    payload.video?.()
  ]);
  await options.save({
    file,
    video,
    videoStartTs: payload.videoStartTs
  });
  if(options.getPayload() === payload) {
    options.clear();
  }
}

export type CommunityCreateState<TVisibility> = {
  title: string,
  visibility: TVisibility,
  mode: CommunityAddMode
};

export type SavedCommunityCreateState<TVisibility> = {
  title: string,
  visibility: TVisibility,
  mode?: CommunityAddMode
};

export function hasCommunityCreateChanges<TVisibility>(
  current: CommunityCreateState<TVisibility>,
  saved?: SavedCommunityCreateState<TVisibility>
) {
  return !saved ||
    current.title.trim() !== saved.title ||
    current.visibility !== saved.visibility ||
    current.mode !== saved.mode;
}

export async function saveCreatedCommunityFields<TVisibility>(options: {
  current: CommunityCreateState<TVisibility>,
  saved: SavedCommunityCreateState<TVisibility>,
  saveTitle: (title: string) => Promise<unknown>,
  saveVisibility: (visibility: TVisibility) => Promise<unknown>,
  saveMode: (mode: CommunityAddMode) => Promise<unknown>
}) {
  const title = options.current.title.trim();
  if(title !== options.saved.title) {
    await options.saveTitle(title);
    options.saved.title = title;
  }

  if(options.current.visibility !== options.saved.visibility) {
    await options.saveVisibility(options.current.visibility);
    options.saved.visibility = options.current.visibility;
  }

  if(options.current.mode !== options.saved.mode) {
    await options.saveMode(options.current.mode);
    options.saved.mode = options.current.mode;
  }
}
