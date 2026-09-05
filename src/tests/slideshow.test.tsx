import Slideshow from '@components/slideshow';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';

type Item = {key: string};

function getItemsTransform(container: HTMLElement) {
  return (container.firstElementChild.children[0] as HTMLElement).style.transform;
}

describe('Slideshow stable selection', () => {
  test('preserves the selected key across reorder and clamps when it disappears', () => {
    const [items, setItems] = createSignal<Item[]>([
      {key: 'a'},
      {key: 'b'},
      {key: 'c'}
    ]);
    const container = document.createElement('div');
    const dispose = render(() => (
      <Slideshow
        items={items()}
        initialIndex={2}
        getItemKey={(item) => item.key}
      >
        {(item) => <span data-key={item.key}>{item.key}</span>}
      </Slideshow>
    ), container);

    expect(getItemsTransform(container)).toBe('translate(-200%, 0)');

    setItems([{key: 'c'}, {key: 'a'}, {key: 'b'}]);
    expect(getItemsTransform(container)).toBe('translate(0%, 0)');

    setItems([{key: 'a'}, {key: 'b'}, {key: 'c'}]);
    expect(getItemsTransform(container)).toBe('translate(-200%, 0)');

    setItems([{key: 'a'}, {key: 'b'}]);
    expect(getItemsTransform(container)).toBe('translate(-100%, 0)');

    setItems([]);
    expect(getItemsTransform(container)).toBe('translate(0%, 0)');
    dispose();
  });
});
