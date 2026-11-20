import type {BrushType, MediaEditorContextValue, MediaEditorState} from '@components/mediaEditor/context';
import {brushDefaults} from '@components/mediaEditor/utils';
import {batch} from 'solid-js';
import type {TextLayerInfo} from '@components/mediaEditor/types';

type Profile = 'desktop' | 'android';
type Brush = MediaEditorState['currentBrush'];
type Settings = Pick<Brush, 'color' | 'size'>;
type Bank = Map<BrushType, Settings>;
type Banks = {profiles: Map<Profile, Bank>; active?: Profile; inherited?: Brush;
  textProfiles?: Map<Profile, TextLayerInfo>; textActive?: Profile; textInherited?: TextLayerInfo};
type Context = Pick<MediaEditorContextValue, 'editorState' | 'mediaState'>;

// Owned by the editor, not its replaceable currentBrush or responsive shells.
const banks = new WeakMap<MediaEditorState, Banks>();
const copyBrush = ({brush, color, size}: Brush): Brush => ({brush, color, size});
const equalBrush = (a: Brush, b: Brush) => a && b && a.brush === b.brush && a.color === b.color && a.size === b.size;
const copyBank = (bank?: Bank): Bank => new Map(Array.from(bank ?? [], ([brush, value]) => [brush, {...value}]));
const copyBanks = (state: Banks): Banks => ({
  profiles: new Map(Array.from(state.profiles, ([profile, bank]) => [profile, copyBank(bank)])),
  active: state.active,
  textProfiles: state.textProfiles && new Map(Array.from(state.textProfiles, ([profile, info]) => [profile, {...info}])),
  textActive: state.textActive,
  textInherited: state.textInherited && {...state.textInherited},
  inherited: state.inherited && copyBrush(state.inherited)
});

function saveActive(editorState: MediaEditorState, state: Banks) {
  if(!state.active || equalBrush(state.inherited, editorState.currentBrush)) return;
  const {brush, color, size} = editorState.currentBrush;
  state.profiles.get(state.active).set(brush, {color, size});
  state.inherited = undefined;
}

export function snapshotBrushBanks(editorState: MediaEditorState): Banks {
  const state = banks.get(editorState);
  if(!state) return {profiles: new Map()};
  saveActive(editorState, state);
  saveText(editorState, state);
  return copyBanks(state);
}

function copyText(info: TextLayerInfo): TextLayerInfo {
  return {font: info.font, alignment: info.alignment, style: info.style, size: info.size, color: info.color};
}

function saveText(editorState: MediaEditorState, state: Banks) {
  if(!state.textProfiles?.has(state.textActive)) return;
  const current = copyText(editorState.currentTextLayerInfo);
  if(state.textInherited && (Object.keys(current) as (keyof TextLayerInfo)[]).every(key => current[key] === state.textInherited[key])) return;
  state.textProfiles.set(state.textActive, current);
  state.textInherited = undefined;
}

/** Track shell ownership without changing a selected layer or applying defaults. */
export function activateTextProfile(editorState: MediaEditorState, profile: Profile) {
  let state = banks.get(editorState);
  if(!state) banks.set(editorState, state = {profiles: new Map()});
  state.textProfiles ??= new Map();
  if(state.textActive !== profile) {
    saveText(editorState, state);
    state.textActive = profile;
    state.textInherited = copyText(editorState.currentTextLayerInfo);
  }
  return state;
}

/** Only a new native text layer asks for these defaults; saved layers never do. */
export function prepareFreshText(context: Pick<MediaEditorContextValue, 'editorState' | 'isEditingForAvatar'>, profile: Profile) {
  if(context.isEditingForAvatar) return;
  const {editorState} = context;
  const state = activateTextProfile(editorState, profile);
  saveText(editorState, state);
  const info = state.textProfiles.get(profile) ?? {
    // Desktop TextPrefs at a532622b, Android PersistColorPalette type 0 / LEFT.
    font: profile === 'desktop' ? 'desktop-default' : 'android-roboto',
    style: profile === 'desktop' ? 'plain' : 'framed',
    alignment: profile === 'desktop' ? 'center' : 'left',
    size: 40,
    color: editorState.currentTextLayerInfo.color
  } satisfies TextLayerInfo;
  Object.assign(editorState.currentTextLayerInfo, info);
  state.textProfiles.set(profile, copyText(info));
  state.textInherited = undefined;
}

export function restoreBrushBanks(editorState: MediaEditorState, saved: Banks) {
  // Handles look up their bank at call time: Cancel also removes profiles first
  // created inside the mode, without leaving mounted shells with stale maps.
  banks.set(editorState, copyBanks(saved));
}

export function snapshotBrushProfile(editorState: MediaEditorState, profile: Profile) {
  const state = banks.get(editorState);
  if(state?.active === profile) saveActive(editorState, state);
  return copyBank(state?.profiles.get(profile));
}

export function getBrushStateBank({editorState, mediaState}: Context, profile: Profile, defaults: (brush: BrushType, current: Brush) => Settings) {
  const activate = () => {
    let state = banks.get(editorState);
    if(!state) {
      state = {profiles: new Map()};
      banks.set(editorState, state);
    }
    if(state.active !== profile) {
      saveActive(editorState, state);
      const current = editorState.currentBrush;
      if(!state.active && !state.profiles.size && equalBrush(current, brushDefaults) &&
        !mediaState.brushDrawnLines.length && !mediaState.history.length) {
        Object.assign(current, defaults(current.brush, current));
      }
      // A responsive switch preserves the visible tool, but must not overwrite
      // the incoming profile's own settings just because its shell mounted.
      state.inherited = state.active ? copyBrush(current) : undefined;
      state.active = profile;
    }
    if(!state.profiles.has(profile)) state.profiles.set(profile, new Map());
    return state;
  };
  activate();
  return {
    change(settings: Partial<Settings>) {
      const state = activate();
      Object.assign(editorState.currentBrush, settings);
      saveActive(editorState, state);
    },
    save() {
      const state = banks.get(editorState);
      if(state?.active === profile) saveActive(editorState, state);
    },
    select(brush: BrushType) {
      const state = activate();
      const current = editorState.currentBrush;
      if(current.brush === brush) return;
      saveActive(editorState, state);
      const saved = state.profiles.get(profile).get(brush) ?? defaults(brush, current);
      state.inherited = undefined;
      batch(() => Object.assign(current, saved, {brush}));
    }
  };
}
