import {MediaEditorTabs} from './media-editor/editor-tabs';
import {EditorHeader} from './media-editor/editor-header';
import RangeSelector from './rangeSelector';
import {RangeSettingSelector} from './sidebarLeft/tabs/generalSettings';

export const AppMediaEditor = ({imageBlobUrl, close} : { imageBlobUrl: string, close: (() => void) }) => {
  const test = [
    <span>Tab 0</span>,
    <span>Tab 1</span>,
    <span>Tab 2</span>,
    <span>Tab 3</span>,
    <span>Tab 4</span>
  ];

  const value = 35;
  const range = new RangeSettingSelector('Edit', 1, value, -50, 50, true, true);
  range.onChange = (value) => { console.info(value) };

  return <div class='media-editor' onClick={() => close()}>
    <div class='media-editor__container' onClick={ev => ev.stopImmediatePropagation()}>
      <div class='media-editor__main-area'>
        <img src={imageBlobUrl} />
      </div>
      <div class='media-editor__settings'>
        <EditorHeader undo={null} redo={null} close={close} />
        <MediaEditorTabs tabs={test} />
        {range.container}
      </div>
    </div>
  </div>
}
