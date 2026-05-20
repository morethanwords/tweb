import {numberThousandSplitterForWatching} from '@helpers/number/numberThousandSplitter';
import {cnTopbarLive} from '@components/chat/topbarLive/topbarLive.cn';

import {Skeleton} from '@components/skeleton';

import '@components/chat/topbarLive/topbarLive.scss';
import {i18n} from '@lib/langPack';
import Button from '@components/buttonTsx';
import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';

export const TopbarLive = (props: {
  watching: number,
  actionButton: JSX.Element
}) => {
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

  return (
    <>
      <Button.Icon icon="livestream" class="danger disable-hover" />
      <div class={cnTopbarLive('-content')}>
        <div class={classNames(cnTopbarLive('-title'), 'primary', 'text-bold')}>
          {i18n('Rtmp.Topbar.Title')}
        </div>
        <div class={classNames(cnTopbarLive('-subtitle'), 'secondary')}>
          {subtitle}
        </div>
      </div>
      {props.actionButton}
    </>
  );
};
