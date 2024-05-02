/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createSignal, onCleanup} from 'solid-js';
import InputSearch from '../inputSearch';

/* @refresh reload */

export default function EmoticonsSearch(props: {
  loading?: Accessor<boolean>,
  onValue: (value: string) => void,
  onFocusChange?: ConstructorParameters<typeof InputSearch>[0]['onFocusChange']
}) {
  const [debounced, setDebounced] = createSignal(false);
  const inputSearch = new InputSearch({
    placeholder: 'Search',
    onChange: (value) => {
      props.onValue(value.trim());
    },
    onFocusChange: props.onFocusChange,
    onDebounce: setDebounced,
    noBorder: true,
    noFocusEffect: true,
    debounceTime: 0
  });
  inputSearch.container.classList.add('emoticons-search-input-container');
  inputSearch.input.classList.add('emoticons-search-input');

  onCleanup(() => {
    inputSearch.remove();
  });

  if(props.loading) {
    createEffect(() => {
      inputSearch.toggleLoading(debounced() || props.loading());
    });
  }

  return (
    <>
      {inputSearch.container}
    </>
  );
}
