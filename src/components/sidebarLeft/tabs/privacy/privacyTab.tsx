import {Component, onMount} from 'solid-js';
import {SliderSuperTabEventable} from '@components/sliderTab';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';

/**
 * Builds a Solid component for a privacy sub-tab. The tab body is just one (or a
 * few) imperative `PrivacySection`s appended to the tab's scrollable, so the
 * component renders nothing itself — `build` runs on mount with the eventable
 * tab instance (PrivacySection saves on the tab's `destroy` event).
 */
const privacyTab = (containerClass: string, build: (tab: SliderSuperTabEventable) => void): Component => {
  return () => {
    const [tab] = useSuperTab();

    onMount(() => {
      tab.container.classList.add('privacy-tab', containerClass);
      build(tab as SliderSuperTabEventable);
    });

    return null;
  };
};

export default privacyTab;
