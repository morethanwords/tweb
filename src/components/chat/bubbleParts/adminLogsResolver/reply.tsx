import createMiddleware from '@helpers/solid/createMiddleware';
import {MessageEntity} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type wrapReply from '@components/wrappers/reply';


export const Reply = (props: {
  colorPeerId?: PeerId;
  title: Parameters<typeof wrapReply>[0]['title'];
  text: string;
  entities?: MessageEntity[];
}) => {
  const {wrapReply} = useHotReloadGuard();

  const content = () => {
    const middleware = createMiddleware().get();

    const container = wrapReply({
      setColorPeerId: props.colorPeerId,
      title: props.title,
      quote: {
        text: props.text,
        entities: props.entities
      },
      middleware
    }).container;

    container.classList.add('margin-0');

    return container;
  };

  return <>{content()}</>;
};
