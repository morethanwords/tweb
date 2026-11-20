import {createSignal} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import {desktopCropOrientation, desktopCropView, fullDesktopCrop, isDesktopCropGeometryActive} from '@components/mediaEditor/native/desktopCropGeometry';
import {validateDesktopExpandedCrop, type DesktopExpandedCrop} from '@components/mediaEditor/native/desktopExpandedCrop';

const sessions = new WeakMap<MediaEditorContextValue, ReturnType<typeof createSession>>();

function createSession(context: MediaEditorContextValue) {
  const {editorState, mediaState, actions} = context;
  const [room, setRoom] = createSignal(false);
  const [draft, setDraft] = createSignal<DesktopExpandedCrop>();
  const [locked, setLocked] = createSignal<ReturnType<typeof desktopCropView>>();
  const descriptor = () => {
    const size = editorState.mediaSize;
    if(!size) return;
    if(draft()) return draft();
    if(Object.prototype.hasOwnProperty.call(mediaState, 'desktopExpandedCrop')) {
      return validateDesktopExpandedCrop(mediaState.desktopExpandedCrop, size);
    }
    return fullDesktopCrop(size);
  };
  const view = () => {
    if(locked()) return locked();
    const d = descriptor(), size = editorState.canvasSize;
    if(!d || !size) return;
    const cropping = editorState.currentTab === 'crop';
    return desktopCropView(d, mediaState.rotation, mediaState.flip,
      {x: 5, y: 5, width: Math.max(1, size[0] - 10), height: Math.max(1, size[1] - 10)},
      cropping && room() ? .7 : 1, cropping);
  };
  function commit(next: DesktopExpandedCrop, force = false) {
    if(!isDesktopCropGeometryActive(context)) throw new Error('Expanded crop unavailable; reset the crop first');
    desktopCropOrientation(mediaState.rotation, mediaState.flip);
    const previous = mediaState.desktopExpandedCrop && structuredClone(unwrap(mediaState.desktopExpandedCrop));
    const validated = validateDesktopExpandedCrop(next, editorState.mediaSize);
    if(!force && !previous && JSON.stringify(validated) === JSON.stringify(fullDesktopCrop(editorState.mediaSize))) return;
    if(JSON.stringify(previous) === JSON.stringify(validated)) return;
    mediaState.desktopExpandedCrop = validated;
    actions.pushToHistory({path: ['desktopExpandedCrop'], oldValue: previous, newValue: structuredClone(validated)});
  }
  function reset() {
    const previous = mediaState.desktopExpandedCrop;
    if(!previous) return;
    const oldValue = structuredClone(unwrap(previous));
    delete mediaState.desktopExpandedCrop;
    actions.pushToHistory({path: ['desktopExpandedCrop'], oldValue, newValue: undefined});
  }
  return {room, setRoom, draft, setDraft, locked, setLocked, descriptor, view, commit, reset};
}

export default function desktopCropSession(context: MediaEditorContextValue) {
  let session = sessions.get(context);
  if(!session) sessions.set(context, session = createSession(context));
  return session;
}
