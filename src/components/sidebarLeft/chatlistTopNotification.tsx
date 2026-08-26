import {createSignal, JSX, Setter} from 'solid-js';
import {render} from 'solid-js/web';
import RowTsx from '@components/rowTsx';

type RowTsxProps = Parameters<typeof RowTsx>[0];

export type ChatlistTopNotificationController = {
  setTitle: (title: JSX.Element) => void,
  setSubtitle: (subtitle: JSX.Element) => void,
  dispose: VoidFunction
};

export function renderChatlistTopNotification(
  toElement: HTMLElement,
  props: {
    onClick: Exclude<RowTsxProps['clickable'], boolean>,
    contextMenu: NonNullable<RowTsxProps['contextMenu']>
  }
): ChatlistTopNotificationController {
  const [title, setTitle] = createSignal<JSX.Element>(true);
  const [subtitle, setSubtitle] = createSignal<JSX.Element>(true);
  const setElement = (setter: Setter<JSX.Element>, element: JSX.Element) => {
    setter(() => element);
  };

  const disposeRoot = render(() => (
    <RowTsx
      class="chatlist-top-notification"
      clickable={props.onClick}
      contextMenu={props.contextMenu}
    >
      <RowTsx.Title>{title()}</RowTsx.Title>
      <RowTsx.Subtitle>{subtitle()}</RowTsx.Subtitle>
      <RowTsx.Icon icon="next" />
    </RowTsx>
  ), toElement);
  let disposed = false;
  const dispose = () => {
    if(disposed) return;

    disposed = true;
    disposeRoot();
  };

  return {
    setTitle: (element) => setElement(setTitle, element),
    setSubtitle: (element) => setElement(setSubtitle, element),
    dispose
  };
}
