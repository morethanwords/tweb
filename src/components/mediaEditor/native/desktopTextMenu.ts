import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import createSubmenuTrigger from '@components/createSubmenuTrigger';
import CheckboxField from '@components/checkboxField';
import Icon from '@components/icon';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import {nativeTextStyles, textAlignments} from '@components/mediaEditor/controlConfig';
import {desktopEditorFonts} from '@components/mediaEditor/fonts';
import selectResizableLayer from '@components/mediaEditor/selectResizableLayer';
import type {ResizableLayer, TextLayerInfo} from '@components/mediaEditor/types';
import contextMenuController from '@helpers/contextMenuController';
import I18n, {LangPackKey} from '@lib/langPack';
import {batch} from 'solid-js';
import {unwrap} from 'solid-js/store';

/** One menu action, one id-addressed edit; no changes to saved legacy values on open. */
export function applyDesktopTextFormat(context: MediaEditorContextValue, layer: ResizableLayer, change: Partial<TextLayerInfo>) {
  const index = context.mediaState.resizableLayers.indexOf(layer);
  if(index < 0 || !layer.textInfo || Object.entries(change).every(([key, value]) => layer.textInfo[key as keyof TextLayerInfo] === value)) return;
  const before = structuredClone(unwrap(layer));
  batch(() => {
    selectResizableLayer(context.editorState, layer);
    Object.assign(context.editorState.currentTextLayerInfo, change);
    Object.assign(layer.textInfo, change);
  });
  context.actions.pushToHistory({
    path: ['resizableLayers', index],
    oldValue: before,
    newValue: structuredClone(unwrap(layer)),
    findBy: {id: layer.id}
  });
}

/** ItemText::contextMenuEvent: Plain first, five fonts, then a non-closing alignment cycle. */
export default function createDesktopTextMenu(context: MediaEditorContextValue, layer: ResizableLayer): ButtonMenuItemOptions[] {
  const choice = (text: LangPackKey, key: 'style' | 'font', value: string): ButtonMenuItemOptions => ({
    text,
    checkboxField: new CheckboxField({asRadio: true, name: `desktop-text-${layer.id}-${key}`, checked: layer.textInfo[key] === value}),
    onClick: () => {
      applyDesktopTextFormat(context, layer, {[key]: value});
      contextMenuController.close();
    }
  });
  const alignment: ButtonMenuItemOptions = {
    text: 'MediaEditor.TextAlignment',
    icon: textAlignments.find(item => item.value === layer.textInfo.alignment)?.icon,
    keepOpen: true,
    onOpen: () => alignment.element?.setAttribute('aria-description', I18n.format(textAlignments.find(item => item.value === layer.textInfo.alignment).label, true)),
    onClick: () => {
      const next = textAlignments[(textAlignments.findIndex(item => item.value === layer.textInfo.alignment) + 1) % textAlignments.length];
      applyDesktopTextFormat(context, layer, {alignment: next.value});
      alignment.element?.querySelector('.btn-menu-item-icon')?.replaceWith(Icon(next.icon, 'btn-menu-item-icon'));
      alignment.element?.setAttribute('aria-description', I18n.format(next.label, true));
    }
  };
  // Reuse the native style definitions without changing Android's cycling order.
  const styles = [...nativeTextStyles.slice(-1), ...nativeTextStyles.slice(0, -1)];
  return [
    ...styles.map(item => choice(item.label, 'style', item.value)),
    createSubmenuTrigger({
      options: {text: 'MediaEditor.Font', icon: 'text'},
      createSubmenu: () => ButtonMenuSync({buttons: desktopEditorFonts.map(item => choice(item.label, 'font', item.font))})
    }),
    alignment
  ];
}
