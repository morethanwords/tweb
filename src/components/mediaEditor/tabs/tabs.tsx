import {ButtonIconTsx} from '@components/buttonIconTsx';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {requestRAF} from '@helpers/solid/requestRAF';
import {createEffect, createSignal, untrack} from 'solid-js';


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

  const [noTransition, setNoTransition] = createSignal(true);

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
    editorState.currentTab = key;
  }

  createEffect(() => {
    const activeTab = tabs.find((tab) => tab.key === editorState.currentTab);
    if(activeTab) {
      const targetBR = activeTab.element.getBoundingClientRect();
      const containerBR = container.getBoundingClientRect();
      underline.style.setProperty('--left', targetBR.left + targetBR.width / 2 - containerBR.left + 'px');

      if(untrack(noTransition)) {
        requestRAF(() => {
          setNoTransition(false);
        });
      }
    }
  });

  return (
    <div ref={container} class="media-editor__tabs">
      {tabs.map((tab) => tab.element)}
      <div
        ref={underline}
        class="media-editor__tabs-underline"
        classList={{'media-editor__tabs-underline--no-transition': noTransition()}}
      />
    </div>
  );
}
