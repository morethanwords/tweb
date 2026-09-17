import type {Middleware} from '@helpers/middleware';
import {JSX} from 'solid-js';
import {i18n, LangPackKey} from '@lib/langPack';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';

export function autoDownloadPeerTypeSection(
  type: 'photo' | 'video' | 'file',
  title: LangPackKey,
  middleware: Middleware,
  /** Rendered after the per-peer-type toggles — the file tab's size limit slider. */
  children?: JSX.Element
) {
  const key = joinDeepPath('settings', 'autoDownload', type);
  const options = [
    {key: 'contacts', title: 'AutodownloadContacts'},
    {key: 'private', title: 'AutodownloadPrivateChats'},
    {key: 'groups', title: 'AutodownloadGroupChats'},
    {key: 'channels', title: 'AutodownloadChannels'}
  ] as const;

  return wrapSolidComponent(() => (
    <Section name={title}>
      {options.map((option) => (
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              stateKey={joinDeepPath(key, option.key)}
              toggle
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n(option.title)}</Row.Title>
        </Row>
      ))}
      {children}
    </Section>
  ), middleware);
}
