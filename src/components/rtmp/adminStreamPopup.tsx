import './adminStreamPopup.scss';

import {createSignal, onMount} from 'solid-js';
import {RtmpData} from './rtmpData';
import rootScope from '../../lib/rootScope';
import {toastNew} from '../toast';
import {i18n} from '../../lib/langPack';
import pause from '../../helpers/schedulers/pause';

const cnPlayer = (className = '') => `rtmp-player${className}`;

export const AdminStreamPopup = ({peerId}: {peerId: PeerId}) => {
  const [rtmpUrl, setRtmpUrl] = createSignal('');
  const [rtmpKey, setRtmpKey] = createSignal('');
  const [rtmpDataLoading, setRtmpDataLoading] = createSignal(true);

  onMount(() => {
    rootScope.managers.appGroupCallsManager.fetchRtmpUrl(peerId).then(async(data) => {
      setRtmpUrl(data.url);
      setRtmpKey(data.key);
      setRtmpDataLoading(false);
    }).catch(() => {
      toastNew({
        langPackKey: 'Error.AnError'
      });
    });
  });

  return (
    <div class={cnPlayer('-empty')}>
      <div class={cnPlayer('-empty-text')}>
        <div class={cnPlayer('-empty-header')}>
          <svg class={cnPlayer('-empty-loader')} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9.83591 16.9562C14.23 16.4944 17.4177 12.5579 16.9559 8.16382C16.494 3.76974 12.5575 0.582034 8.16345 1.04387C3.76938 1.50571 0.58167 5.4422 1.04351 9.83627" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div class={cnPlayer('-empty-title')}>{i18n('Rtmp.MediaViewer.Failed.Title')}</div>
        </div>
        <div class={cnPlayer('-empty-text-inner')}>
          {i18n('Rtmp.MediaViewer.Failed.Description')}
        </div>
        <RtmpData
          key={rtmpKey()}
          url={rtmpUrl()}
          loading={rtmpDataLoading()}
          contrast
        />
      </div>
    </div>
  );
};
