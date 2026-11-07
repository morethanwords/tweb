import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {MediaTsx} from '@components/wrappers/mediaTsx';
import pause from '@helpers/schedulers/pause';

// A wrapper draws into its container. A photo or a document that comes again as another object of the same one (the
// page of a rich message rebuilt once it is sent) is not drawn a second time, and another one takes the place of the
// one before instead of being drawn beside it.

describe('MediaTsx', () => {
  test('draws the same document once, and another in place of it', async() => {
    const loader = vi.fn(async({container, item}: {container: HTMLElement, item: {id: string}}) => {
      const element = document.createElement('i');
      element.textContent = item.id;
      container.append(element);
      return element;
    });
    const [doc, setDoc] = createSignal<any>({_: 'document', id: '1'});
    const root = document.createElement('div');
    const Media = MediaTsx as any;
    const dispose = render(() => <Media itemKey="doc" doc={doc()} loader={loader} />, root);
    await pause(0);
    expect(loader).toHaveBeenCalledTimes(1);

    setDoc({_: 'document', id: '1'});
    await pause(0);
    expect(loader).toHaveBeenCalledTimes(1);

    setDoc({_: 'document', id: '2'});
    await pause(0);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(root.textContent).toBe('2');
    dispose();
  });
});
