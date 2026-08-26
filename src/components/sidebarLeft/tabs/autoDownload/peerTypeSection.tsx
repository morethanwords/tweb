import type {Middleware} from '@helpers/middleware';
import {i18n, LangPackKey} from '@lib/langPack';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';
import SettingSection from '@components/settingSection';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {renderComponent} from '@helpers/solid/renderComponent';

export function autoDownloadPeerTypeSection(
  type: 'photo' | 'video' | 'file',
  title: LangPackKey,
  middleware: Middleware
) {
  const section = new SettingSection({name: title});

  const key = joinDeepPath('settings', 'autoDownload', type);
  const options = [
    {key: 'contacts', title: 'AutodownloadContacts'},
    {key: 'private', title: 'AutodownloadPrivateChats'},
    {key: 'groups', title: 'AutodownloadGroupChats'},
    {key: 'channels', title: 'AutodownloadChannels'}
  ] as const;

  renderComponent({
    element: section.content,
    Component: () => (
      <>
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
      </>
    ),
    middleware
  });

  return section;
}
