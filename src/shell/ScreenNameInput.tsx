import {onCleanup, onMount} from 'solid-js';

/** One shared title draft is owned by App, regardless of the editing surface. */
export function ScreenNameInput(props: {
  value: string; testId: string; label?: string; onInput: (value: string) => void;
  onFinish: (cancel?: boolean) => void; composing: (value: boolean) => void;
}) {
  let input!: HTMLInputElement;
  let ime = false;
  let blurred = false;
  onMount(() => {input.focus({preventScroll: true}); input.select();});
  onCleanup(() => props.composing(false));
  return <input ref={element => {input = element;}} class="screen-title-input" aria-label={props.label ?? 'Название экрана'}
    data-testid={props.testId} value={props.value} autocomplete="off"
    onClick={event => event.stopPropagation()}
    onInput={event => props.onInput(event.currentTarget.value)}
    onCompositionStart={() => {ime = true; props.composing(true);}}
    onCompositionEnd={event => {ime = false; props.composing(false); props.onInput(event.currentTarget.value); if(blurred) props.onFinish();}}
    onBlur={() => {if(ime) blurred = true; else props.onFinish();}}
    onKeyDown={event => {
      event.stopPropagation();
      if(ime || event.isComposing) return;
      if(event.key === 'Enter' || event.key === 'Escape') {event.preventDefault(); props.onFinish(event.key === 'Escape');}
    }} />;
}
