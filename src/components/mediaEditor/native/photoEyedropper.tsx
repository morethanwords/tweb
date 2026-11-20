import {createEffect, createSignal, onCleanup, onMount, Show} from 'solid-js';
import A11yButton from '@components/a11yButton';
import RangeInput from '@components/mediaEditor/rangeInput';
import {createPhotoSnapshotSession, PhotoSnapshot, photoSamplePoint, samplePhoto} from '@components/mediaEditor/native/photoEyedropperSnapshot';
import useNestedNavigation from '@components/mediaEditor/native/useNestedNavigation';
import Modes from '@config/modes';
import createFocusTrap from '@helpers/dom/focusTrap';
import clamp from '@helpers/number/clamp';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import styles from '@components/mediaEditor/native/androidColorPicker.module.scss';

export default function PhotoEyedropper(props: {
  snapshot: () => Promise<Blob>;
  isValid: () => boolean;
  onSelect: (color: string) => void;
  onCancel: () => void;
}) {
  let overlay: HTMLDivElement, surface: HTMLCanvasElement, magnifier: HTMLCanvasElement;
  let pointer: number, bounds: DOMRect;
  let session: ReturnType<typeof createPhotoSnapshotSession>;
  let photo: PhotoSnapshot;
  const [ready, setReady] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [position, setPosition] = createSignal([.5, .5]);
  const [color, setColor] = createSignal('#000000ff');
  let finished = false;
  const cancel = () => {
    if(finished) return;
    finished = true;
    session?.dispose();
    props.onCancel();
  };
  const accept = () => {
    if(finished || !ready() || !session?.valid()) return;
    finished = true;
    const selected = samplePhoto(photo.canvas, position()[0], position()[1]);
    session.dispose();
    props.onSelect(selected);
  };
  useNestedNavigation(() => true, cancel);
  onCleanup(() => {
    finished = true;
    session?.dispose();
    if(surface) surface.width = surface.height = 0;
  });
  onMount(() => {
    const trap = createFocusTrap(overlay);
    trap.activate();
    onCleanup(() => trap.deactivate());
    session = createPhotoSnapshotSession(props.snapshot, overlay.ownerDocument, props.isValid);
    void session.load().then(result => {
      if(!result || finished || !session.valid()) return;
      photo = result;
      surface.width = photo.canvas.width;
      surface.height = photo.canvas.height;
      surface.getContext('2d').drawImage(photo.canvas, 0, 0);
      setReady(true);
    }).catch(() => {
      if(!finished && session.valid()) setFailed(true);
    });
  });
  createEffect(() => {
    if(!ready() || finished) return;
    const [x, y] = position();
    setColor(samplePhoto(photo.canvas, x, y));
    const [px, py] = photoSamplePoint(x, y, photo.canvas.width, photo.canvas.height);
    const ctx = magnifier.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 112, 112);
    ctx.drawImage(photo.canvas, px - 3.5, py - 3.5, 7, 7, 0, 0, 112, 112);
    ctx.strokeStyle = '#ffffff99';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i = 0; i <= 7; ++i) {
      ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16, 112);
      ctx.moveTo(0, i * 16); ctx.lineTo(112, i * 16);
    }
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 48, 16, 16);
  });
  const move = (event: PointerEvent) => {
    if(finished || event.pointerId !== pointer) return;
    setPosition([clamp((event.clientX - bounds.left) / bounds.width, 0, 1), clamp((event.clientY - bounds.top) / bounds.height, 0, 1)]);
  };
  const label = 'MediaEditor.Eyedropper' as LangPackKey;
  return <div ref={overlay} class={styles.eyedropper} role="dialog" aria-modal="true" aria-label={I18n.format(label, true)} aria-busy={!ready() && !failed()}>
    <p class={styles.sampleHint}>{i18n('MediaEditor.Eyedropper.Hint' as LangPackKey)}</p>
    <Show when={!ready()}><p role="status">{failed() ? i18n('MediaEditor.Eyedropper.Error' as LangPackKey) : i18n('Loading')}</p></Show>
    <div class={styles.sampleArea}>
      <canvas ref={surface} class={styles.sampleSurface} dir="ltr" aria-hidden="true"
        style={{visibility: ready() ? undefined : 'hidden'}}
        onPointerDown={event => {
          if(!ready() || finished || pointer !== undefined || event.button !== 0 || !session.valid()) return;
          event.preventDefault();
          bounds = event.currentTarget.getBoundingClientRect();
          pointer = event.pointerId;
          event.currentTarget.setPointerCapture(pointer);
          move(event);
        }} onPointerMove={move}
        onPointerUp={event => {
          if(event.pointerId !== pointer) return;
          if(!event.currentTarget.hasPointerCapture(pointer)) return cancel();
          move(event); // Sample release coordinates even if the last move was coalesced.
          pointer = undefined;
          event.currentTarget.releasePointerCapture(event.pointerId);
          accept();
        }} onPointerCancel={event => { if(event.pointerId === pointer) cancel(); }}
        onLostPointerCapture={event => { if(event.pointerId === pointer) cancel(); }} />
    </div>
    <div class={styles.samplePreview} aria-hidden="true" style={{'border-color': color(), visibility: ready() ? undefined : 'hidden'}}>
      <canvas ref={magnifier} width="112" height="112" />
    </div>
    <Show when={ready() && Modes.a11y}>
      <div class={styles.samplePosition}>
        <RangeInput label={i18n('MediaEditor.Eyedropper.X' as LangPackKey)} ariaLabel={'MediaEditor.Eyedropper.X' as LangPackKey}
          min={0} max={photo.canvas.width - 1} value={photoSamplePoint(...position() as [number, number], photo.canvas.width, photo.canvas.height)[0]}
          onChange={x => setPosition([x / photo.canvas.width, position()[1]])} />
        <RangeInput label={i18n('MediaEditor.Eyedropper.Y' as LangPackKey)} ariaLabel={'MediaEditor.Eyedropper.Y' as LangPackKey}
          min={0} max={photo.canvas.height - 1} value={photoSamplePoint(...position() as [number, number], photo.canvas.width, photo.canvas.height)[1]}
          onChange={y => setPosition([position()[0], y / photo.canvas.height])} />
        <output dir="ltr">{color()}</output>
      </div>
    </Show>
    <div class={styles.sampleActions}>
      <A11yButton class={styles.done} onClick={cancel}>{i18n('Cancel')}</A11yButton>
      <A11yButton class={styles.done} disabled={!ready()} onClick={accept}>{i18n('Done')}</A11yButton>
    </div>
  </div>;
}
