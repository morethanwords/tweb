import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {MediaTsx} from '@components/wrappers/mediaTsx';
import pause from '@helpers/schedulers/pause';
import classNames from '@helpers/string/classNames';

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
  test('keeps the classes the wrapper put on the container when the holder renders again', async() => {
    const loader = vi.fn(async({container}: {container: HTMLElement}) => {
      container.classList.add('media-container', 'media-container-fitted');
      return container;
    });
    const [doc, setDoc] = createSignal<any>({_: 'document', id: '1'});
    const [grouped, setGrouped] = createSignal(false);
    const root = document.createElement('div');
    const Media = MediaTsx as any;
    const dispose = render(() => (
      <Media
        itemKey="doc"
        doc={doc()}
        class={classNames(doc() && 'media', !grouped() && 'frame')}
        loader={loader}
      />
    ), root);
    await pause(0);
    const container = root.firstElementChild;
    expect([...container.classList]).toEqual(['media', 'frame', 'media-container', 'media-container-fitted']);

    setDoc({_: 'document', id: '1'});
    await pause(0);
    expect([...container.classList]).toEqual(['media', 'frame', 'media-container', 'media-container-fitted']);

    setGrouped(true);
    await pause(0);
    expect([...container.classList].sort()).toEqual(['media', 'media-container', 'media-container-fitted']);
    expect(loader).toHaveBeenCalledTimes(1);
    dispose();
  });
});
