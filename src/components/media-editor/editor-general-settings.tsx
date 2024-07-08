import {i18n, I18n, LangPackKey} from '../../lib/langPack';
import {createEffect, createSignal, For} from 'solid-js';
import {MediaEditorSlider} from './editor-slider';

export interface MediaEditorSetting {
  label: LangPackKey;
  key?: string;
  symmetrical?: true;
}

export const MediaEditorGeneralSettings = ({change}: { change: (data: any) => void }) => {
  const settings: MediaEditorSetting[] = [
    {label: 'MediaEditor.General.Enhance', key: 'enhance'},
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

  const [data, setData] = createSignal(settings.filter(entry => entry.key).reduce((acc, curr) => ({...acc, [curr.key]: 0}), { } as any));
  createEffect(() => change(data()));

  return <div class='general-settings-container'>
    <For each={settings}>
      {(entry) => <MediaEditorSlider label={entry.label}
        change={entry.key ? val => setData(prev => ({...prev, [entry.key]: val})): () => {}}
        max={entry.symmetrical ? 50 : 100} symmetric={entry.symmetrical || false} /> }
    </For>
  </div>
};
