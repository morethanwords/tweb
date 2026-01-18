import {numberThousandSplitterForWatching} from '@helpers/number/numberThousandSplitter';
import {cnTopbarLive} from '@components/chat/topbarLive/topbarLive.cn';
import {TopbarLiveButton} from '@components/chat/topbarLive/button';

import {Skeleton} from '@components/skeleton';

import '@components/chat/topbarLive/topbarLive.scss';
import {i18n} from '@lib/langPack';
import wrapReply from '@components/wrappers/reply';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {onCleanup, Accessor} from 'solid-js';

export interface TopbarLiveProps {
  watching?: number;
  onJoin: () => void;
  animationTrigger: Accessor<PeerId>;
}

export const TopbarLive = (props: TopbarLiveProps) => {
  const watching = () => props.watching > 0 ?
    i18n('Rtmp.Watching', [numberThousandSplitterForWatching(Math.max(0, props.watching))]) :
    i18n('Rtmp.Topbar.NoViewers');

  const subtitle = (
    <div>
      <Skeleton loading={props.watching === undefined}>
        {watching()}
      </Skeleton>
    </div>
  );

  const {container} = wrapReply({
    title: i18n('Rtmp.Topbar.Title'),
    subtitle: subtitle as HTMLElement
  });

  const background = document.createElement('div');
  background.classList.add(cnTopbarLive() + '-background');

  container.prepend(background);
  container.classList.remove('quote-like-hoverable');
  container.classList.add(cnTopbarLive() + '-wrapper');

  onCleanup(attachClickEvent(container, props.onJoin));

  let button: HTMLButtonElement;
  <TopbarLiveButton ref={button} animationTrigger={props.animationTrigger} />;
  container.append(button);

  return container;
};
