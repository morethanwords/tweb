import {i18n, I18n, LangPackKey} from '../../lib/langPack';
import {For} from 'solid-js';
import {MediaEditorSlider} from './editor-slider';

export interface MediaEditorSetting {
  label: LangPackKey;
  symmetrical?: true;
}

export const MediaEditorGeneralSettings = () => {
  const settings: MediaEditorSetting[] = [
    {label: 'MediaEditor.General.Enhance'},
    {label: 'MediaEditor.General.Brightness', symmetrical: true},
    {label: 'MediaEditor.General.Contrast', symmetrical: true},
    {label: 'MediaEditor.General.Saturation', symmetrical: true},
    {label: 'MediaEditor.General.Warmth', symmetrical: true},
    {label: 'MediaEditor.General.Fade'},
    {label: 'MediaEditor.General.Highlights', symmetrical: true},
    {label: 'MediaEditor.General.Shadows', symmetrical: true},
    {label: 'MediaEditor.General.Vignette'},
    {label: 'MediaEditor.General.Grain'},
    {label: 'MediaEditor.General.Sharpen'}
  ];

  return <div class='general-settings-container'>
    <For each={settings}>
      {(entry) => <MediaEditorSlider label={entry.label} max={entry.symmetrical ? 50 : 100} symmetric={entry.symmetrical || false} /> }
    </For>
  </div>
};
