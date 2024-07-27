import {LangPackKey} from '../../../lib/langPack';
import {For} from 'solid-js';
import {MediaEditorSlider} from '../editor-slider';
import {MediaEditorSettings} from '../../appMediaEditor';
import {SetStoreFunction} from 'solid-js/store';

export const MediaEditorGeneralSettings = (props: { state: MediaEditorSettings['filters'], change: () => void, updateState: SetStoreFunction<MediaEditorSettings> }) => {
  const settings: { label: LangPackKey, symmetrical?: true, key: keyof MediaEditorSettings['filters'] }[] = [
    {label: 'MediaEditor.General.Enhance', key: 'enhance'},
    {label: 'MediaEditor.General.Brightness', symmetrical: true, key: 'brightness'},
    {label: 'MediaEditor.General.Contrast', symmetrical: true, key: 'contrast'},
    {label: 'MediaEditor.General.Saturation', symmetrical: true, key: 'saturation'},
    {label: 'MediaEditor.General.Warmth', symmetrical: true, key: 'warmth'},
    {label: 'MediaEditor.General.Fade', key: 'fade'},
    {label: 'MediaEditor.General.Highlights', symmetrical: true, key: 'highlights'},
    {label: 'MediaEditor.General.Shadows', symmetrical: true, key: 'shadows'},
    {label: 'MediaEditor.General.Vignette', key: 'vignette'},
    {label: 'MediaEditor.General.Grain', key: 'grain'},
    {label: 'MediaEditor.General.Sharpen', key: 'sharpen'}
  ];

  return <div class='settings-container filters'>
    <For each={settings}>
      {(entry) => <MediaEditorSlider label={entry.label}
        change={val => {
          props.updateState('filters', entry.key, val);
          props.change(); // dumbass stores
        }}
        max={entry.symmetrical ? 50 : 100} symmetric={entry.symmetrical || false} /> }
    </For>
  </div>
};
