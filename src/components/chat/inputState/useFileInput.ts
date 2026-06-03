import {createEffect, createMemo, on} from 'solid-js';
import type ChatInput from '../input';
import type {ChatInputStateStore} from './index';


export default function useFileInput(instance: ChatInput, store: ChatInputStateStore) {
  const isMultiple = createMemo(() => !store.isEditing && !store.isSuggesting);

  createEffect(() => {
    if(!instance.fileInput) return;
    instance.fileInput.multiple = isMultiple();
  });

  createEffect(on(() => store.isEditing, (isEditing) => {
    instance.attachMenu.feedProps({
      isEditing: isEditing
    });
  }, {
    defer: true
  }));
}
