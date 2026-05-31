import {Component, onMount} from 'solid-js';
import {SliderSuperTabEventable} from '@components/sliderTab';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';

/**
 * Thin Solid wrapper for an auto-download sub-tab: builds its section(s) on
 * mount with the eventable tab instance (the parent dataAndStorage tab listens
 * for this tab's `destroy` event to refresh its subtitles).
 */
const autoDownloadTab = (build: (tab: SliderSuperTabEventable) => void): Component => {
  return () => {
    const [tab] = useSuperTab();

    onMount(() => {
      build(tab as SliderSuperTabEventable);
    });

    return null;
  };
};

export default autoDownloadTab;
