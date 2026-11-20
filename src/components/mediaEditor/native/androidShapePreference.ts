import type {MediaEditorState} from '@components/mediaEditor/context';
import type {AppManagers} from '@lib/managers';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import {createSignal, onCleanup} from 'solid-js';
import {logger} from '@lib/logger';
import {AndroidTextPreferences, normalizeAndroidTextPreferences} from '@components/mediaEditor/native/androidTextPreferences';
import {canonicalAndroidColor, insertAndroidPaletteColor, isAndroidEditorColor, normalizeAndroidCustomColors} from '@components/mediaEditor/native/androidPalette';

const log = logger('ANDROID-SHAPE-PREFERENCE');

/** One editor lifetime, not one responsive shell. No network or shared settings. */
export default function createAndroidShapePreference(editorState: Pick<MediaEditorState, 'androidFilledShapes' | 'currentTextLayerInfo'>, source: AppManagers) {
  const managers = bindManagersToSession(source);
  const session = managers && getManagersSession(managers);
  let disposed = false;
  let initialized = false;
  let touched = false;
  let text = normalizeAndroidTextPreferences();
  const [customColors, setCustomColors] = createSignal(normalizeAndroidCustomColors());
  let paletteLoaded = !managers;
  const paletteGestures: string[] = [];
  const textGestures: Partial<AndroidTextPreferences> = {};
  const alive = () => !disposed && (!session || !isSessionLeaving(session));
  onCleanup(() => { disposed = true; });
  return {
    customColors,
    initialize() {
      if(initialized || !alive()) return;
      initialized = true;
      if(!managers) return;
      // The worker already holds account state. Never block mounting the editor,
      // and never let an answer arriving late undo a gesture made in the meantime.
      Promise.resolve(managers.appStateManager.getAndroidEditorPreferences()).then(saved => {
        if(!alive()) return;
        if(!touched) editorState.androidFilledShapes = saved?.filledShapes === true;
        // Only future new layers use a late answer. Existing/selected text is
        // never touched, and explicit gestures win independently for each field.
        text = {...normalizeAndroidTextPreferences(saved?.text), ...textGestures};
        // Rebase early choices on the account's actual tail, not default slots.
        setCustomColors(paletteGestures.reduce(insertAndroidPaletteColor, normalizeAndroidCustomColors(saved?.customColors)));
        paletteLoaded = true;
        paletteGestures.length = 0;
      }).catch(error => { if(alive()) log.error('load fill preference', error); });
    },
    prepareText() {
      if(alive()) Object.assign(editorState.currentTextLayerInfo, text);
    },
    selectColor(value: string) {
      if(!alive() || !isAndroidEditorColor(value)) return false;
      value = canonicalAndroidColor(value);
      if(!paletteLoaded) paletteGestures.push(value);
      setCustomColors(insertAndroidPaletteColor(customColors(), value));
      // Only dismissal/selection gestures call this; history and document Cancel
      // never do. Native saves the palette independently of document acceptance.
      // The worker inserts into its current account record, not a possibly stale
      // UI snapshot. Start the write now, even if Cancel disposes this editor.
      if(managers) Promise.resolve(managers.appStateManager.selectAndroidEditorColor(value))
        .catch(error => { if(alive()) log.error('save palette preference', error); });
      return true;
    },
    setText(patch: Partial<AndroidTextPreferences>) {
      if(!alive()) return;
      Object.assign(textGestures, patch);
      Object.assign(text, patch);
      // Persist only actual gestures, never selection, history or checkpoint
      // restoration. Font/style/alignment and palette colors survive discard.
      if(managers) Promise.resolve(managers.appStateManager.setAndroidEditorPreferences({text: patch}))
        .catch(error => { if(alive()) log.error('save text preference', error); });
    },
    set(filled: boolean) {
      if(!alive()) return;
      touched = true;
      editorState.androidFilledShapes = filled;
      // Native 21f7d109 PersistColorPalette.java:167-169 saves immediately, even
      // when the document is later discarded. Cancel must not roll this back.
      if(managers) Promise.resolve(managers.appStateManager.setAndroidFilledShapes(filled))
        .catch(error => { if(alive()) log.error('save fill preference', error); });
    }
  };
}
