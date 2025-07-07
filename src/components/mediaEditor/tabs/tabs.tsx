import {ButtonIconTsx} from '../../buttonIconTsx';

import {useMediaEditorContext} from '../context';

type ConfigItem = {
  icon: Icon;
  key: string;
};

const config: ConfigItem[] = [
  {icon: 'equalizer', key: 'adjustments'},
  {icon: 'crop', key: 'crop'},
  {icon: 'text', key: 'text'},
  {icon: 'brush', key: 'brush'},
  {icon: 'smile', key: 'stickers'}
];

export const mediaEditorTabsOrder = config.map((item) => item.key);

export default function Tabs() {
  const {editorState} = useMediaEditorContext();

  let container: HTMLDivElement;
  let underline: HTMLDivElement;

  const tabs = config.map((item) => ({
    ...item,
    element: (
      <div class="media-editor__tabs-item" classList={{'media-editor__tabs-item--active': editorState.currentTab === item.key}}>
        <ButtonIconTsx icon={item.icon} onClick={() => onTabClick(item.key)} />
      </div>
    ) as HTMLElement
  }));

  function onTabClick(key: string) {
    const target = tabs.find((tab) => tab.key === key).element;
    const containerBR = container.getBoundingClientRect();
    const targetBR = target.getBoundingClientRect();

    underline.style.setProperty('--left', targetBR.left + targetBR.width / 2 - containerBR.left + 'px');

    editorState.currentTab = key;
  }

  return (
    <div ref={container} class="media-editor__tabs">
      {tabs.map((tab) => tab.element)}
      <div ref={underline} class="media-editor__tabs-underline" />
    </div>
  );
}
