import {createEffect, createMemo, on} from 'solid-js';
import type {ChatInputStateContext} from './index';


export default function useFileInput({instance, store}: ChatInputStateContext) {
  const isMultiple = createMemo(() => !store.isEditing && !store.isSuggesting);

  createEffect(() => {
    if(!instance.fileInput) return;
    instance.fileInput.multiple = isMultiple();
  });

  createEffect(on(() => store.isReplacingMedia, (isReplacingMedia) => {
    instance.attachMenu.feedProps({
      isReplacingMedia
    });
  }, {
    defer: true
  }));
}
