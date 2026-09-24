import {handleTabKeyDown} from '@helpers/dom/tabList';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {requestRAF} from '@helpers/solid/requestRAF';
import I18n, {LangPackKey} from '@lib/langPack';
import {createEffect, createSignal, untrack} from 'solid-js';


type ConfigItem = {
  icon: Icon;
  key: string;
  label: LangPackKey;
};

const config: ConfigItem[] = [
  {icon: 'equalizer', key: 'adjustments', label: 'MediaEditor.Tab.Adjustments'},
  {icon: 'crop', key: 'crop', label: 'MediaEditor.Tab.Crop'},
  {icon: 'text', key: 'text', label: 'MediaEditor.Tab.Text'},
  {icon: 'brush', key: 'brush', label: 'MediaEditor.Tab.Draw'},
  {icon: 'smile', key: 'stickers', label: 'MediaEditor.Tab.Stickers'}
];

export const mediaEditorTabsOrder = config.map((item) => item.key);
export const getMediaEditorTabId = (key: string) => `media-editor-tab-${key}`;
export const getMediaEditorTabPanelId = (key: string) => `media-editor-tab-panel-${key}`;

export default function Tabs() {
  const {editorState} = useMediaEditorContext();

  const [noTransition, setNoTransition] = createSignal(true);

  let container: HTMLDivElement;
  let underline: HTMLDivElement;

  const tabs = config.map((item) => ({
    ...item,
    element: (
      <div class="media-editor__tabs-item" classList={{'media-editor__tabs-item--active': editorState.currentTab === item.key}}>
        <ButtonIconTsx
          type="button"
          icon={item.icon}
          role="tab"
          id={getMediaEditorTabId(item.key)}
          aria-label={I18n.format(item.label, true)}
          aria-controls={editorState.currentTab === item.key ? getMediaEditorTabPanelId(item.key) : undefined}
          aria-selected={editorState.currentTab === item.key}
          tabIndex={editorState.currentTab === item.key ? 0 : -1}
          onClick={() => onTabClick(item.key)}
        />
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
    <div ref={container} class="media-editor__tabs" role="tablist" onKeyDown={handleTabKeyDown} aria-label={I18n.format('MediaEditor.Tabs', true)}>
      {tabs.map((tab) => tab.element)}
      <div
        ref={underline}
        class="media-editor__tabs-underline"
        aria-hidden="true"
        classList={{'media-editor__tabs-underline--no-transition': noTransition()}}
      />
    </div>
  );
}
