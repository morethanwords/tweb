import {createEffect, createSignal, onMount, Signal} from 'solid-js';
import {MediaEditorSettings} from '../../appMediaEditor';
import {TextRenderer} from './text-renderer';

export const AddTextPanel = (props: { finishEditText: (text: string, data: {
    color: number | string;
    align: number;
    outline: number;
    size: number;
    font: number;
  }) => void, createNewText: (text: string, data: {
    color: number | string;
    align: number;
    outline: number;
    size: number;
    font: number;
  }) => void, state: MediaEditorSettings['text'], editingText: Signal<any>}) => {
  const [editingText, setEditingText] = props.editingText;
  let content: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  const [newText, setNewText] = createSignal('test');
  const caretToEnd = () => {
    const range = document.createRange();
    const selection = window.getSelection();
    range.setStart(content, content.childNodes.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const editing = () => editingText() && editingText().text;

  createEffect(() => {
    if(editing()) {
      setNewText(editingText().text);
    }
  })

  createEffect(() => {
    // if newline, trim all stuff before appending (dont add 2 newlines)
    content.innerText = newText();
    caretToEnd();
  });

  onMount(() => {
    setTimeout(() => {
      content.focus();
    }, 150);
    console.info('MOUNT', canvas);
  });

  return <div onclick={ev => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if(!newText().trim()) {
      return;
    }
    if(editing()) {
      props.finishEditText(newText(), props.state);
    } else {
      props.createNewText(newText(), props.state);
    }
    setEditingText(false);
  }} classList={{'media-paint-panel': true, 'media-editor-stickers-panel': true, 'edit-text-panel': true}}>
    <div class='text-edit' ref={content} onblur={() => {
      content.focus();
      caretToEnd();
    }} style={{'position': 'fixed', 'left': '-1000px', 'top': '-1000px', 'color': 'white', 'white-space': 'pre-wrap', 'min-width': '100px', 'min-height': '100px'}}
    contentEditable={true}
    onInput={() => setNewText(content.innerText)}></div>
    <div onclick={ev => ev.stopImmediatePropagation()}>
      <TextRenderer text={newText()} state={props.state} />
    </div>
  </div>
};
