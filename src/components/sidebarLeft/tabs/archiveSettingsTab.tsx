import SaveButton from '@components/saveButton';
import Section from '@components/section';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import StaticSwitch from '@components/staticSwitch';
import deepEqual from '@helpers/object/deepEqual';
import setBooleanFlag from '@helpers/object/setBooleanFlag';
import {I18nTsx} from '@helpers/solid/i18n';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createComputed, createMemo, createResource, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import useIsPremium from './privacy/messages/useIsPremium';


export default function ArchiveSettingsTab() {
  const [tab] = useSuperTab();
  const {Row, rootScope} = useHotReloadGuard();

  const promiseCollector = usePromiseCollector();

  const [globalPrivacy] = createResource(() => {
    const promise = rootScope.managers.appPrivacyManager.getGlobalPrivacySettings();
    promiseCollector.collect(promise);
    return promise;
  });

  const isPremium = useIsPremium();

  const isReady = createMemo(() => globalPrivacy.state === 'ready');

  const [store, setStore] = createStore({
    keepArchivedUnmutedChats: false,
    keepArchiveFromFolders: false,
    archiveNonContactChats: false
  });

  type StoreState = typeof store;

  let initialValues: StoreState = {
    keepArchivedUnmutedChats: false,
    keepArchiveFromFolders: false,
    archiveNonContactChats: false
  };

  const hasChanges = createMemo(() => !deepEqual(store, initialValues));

  createComputed(() => {
    if(!isReady()) return;

    initialValues = {
      keepArchivedUnmutedChats: !!globalPrivacy()?.pFlags?.keep_archived_unmuted,
      keepArchiveFromFolders: !!globalPrivacy()?.pFlags?.keep_archived_folders,
      archiveNonContactChats: !!globalPrivacy()?.pFlags?.archive_and_mute_new_noncontact_peers
    };

    setStore(initialValues);
  });

  const saveGlobalSettings = wrapAsyncClickHandler(async() => {
    if(!isReady()) return;

    const settings = structuredClone(globalPrivacy());

    settings.pFlags ??= {};
    setBooleanFlag(settings.pFlags, 'keep_archived_unmuted', store.keepArchivedUnmutedChats);
    setBooleanFlag(settings.pFlags, 'keep_archived_folders', store.keepArchivedUnmutedChats ? true : store.keepArchiveFromFolders);
    setBooleanFlag(settings.pFlags, 'archive_and_mute_new_noncontact_peers', store.archiveNonContactChats);

    await rootScope.managers.appPrivacyManager.setGlobalPrivacySettings(settings);

    tab.close();
  });

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({hasChanges, saveAllSettings: saveGlobalSettings, descriptionLangKey: 'UnsavedChangesDescription.Archive'});

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChanges()} onClick={() => void saveGlobalSettings()} />
      </Portal>
      <Section name='ArchiveSettings.UnmutedChats.Title' caption='ArchiveSettings.UnmutedChats.Description'>
        <Row clickable={() => setStore('keepArchivedUnmutedChats', prev => !prev)}>
          <Row.Title>
            <I18nTsx key='ArchiveSettings.UnmutedChats.Action' />
          </Row.Title>
          <Row.RightContent>
            <StaticSwitch checked={store.keepArchivedUnmutedChats} />
          </Row.RightContent>
        </Row>
      </Section>
      <Show when={isReady()}> {/* Prevent animation triggering when the store is initialized */}
        <HeightTransition>
          <Show when={!store.keepArchivedUnmutedChats}>
            <div style={{overflow: 'hidden'}}> {/* Note: The `overflow: hidden` makes so the margin-bottom of the section is included in the scroll height */}
              <Section name='ArchiveSettings.FolderChats.Title' caption='ArchiveSettings.FolderChats.Description'>
                <Row clickable={() => setStore('keepArchiveFromFolders', prev => !prev)}>
                  <Row.Title>
                    <I18nTsx key='ArchiveSettings.FolderChats.Action' />
                  </Row.Title>
                  <Row.RightContent>
                    <StaticSwitch checked={store.keepArchiveFromFolders} />
                  </Row.RightContent>
                </Row>
              </Section>
            </div>
          </Show>
        </HeightTransition>
      </Show>
      <Show when={isPremium()}>
        <Section name='ArchiveSettings.NewChats.Title' caption='ArchiveSettings.NewChats.Description'>
          <Row clickable={() => setStore('archiveNonContactChats', prev => !prev)}>
            <Row.Title>
              <I18nTsx key='ArchiveSettings.NewChats.Action' />
            </Row.Title>
            <Row.RightContent>
              <StaticSwitch checked={store.archiveNonContactChats} />
            </Row.RightContent>
          </Row>
        </Section>
      </Show>
    </>
  );
}
