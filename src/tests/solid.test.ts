import {createStore} from 'solid-js/store';

type Item = {
  _: 'a' | 'b',
  x: 'a' | 'b'
};

const keys: (keyof Item)[] = ['_'];
keys.forEach((key) => {
  const [state, setState] = createStore({
    array: [] as Item[]
  });

  const makeItem = (value: 'a' | 'b') => {
    return {
      [key]: value
    } as Item;
  };

  test('first insert', () => {
    setState('array', (arr) => [...arr, makeItem('a')]);
    expect(state.array[0][key]).toBe('a');
  });

  test('modification', () => {
    setState('array', 0, makeItem('b'));
    expect(state.array[0][key]).toBe('b');
  });
});
