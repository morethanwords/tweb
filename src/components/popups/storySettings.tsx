import {createSignal, createUniqueId, For, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {IconTsx} from '@components/iconTsx';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import showPickUserPopup from '@components/popups/pickUser';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import {ROW_SELECTION_MEDIA_CLASS, ROW_SELECTION_RADIO_CLASS, ROW_WITH_CHECKBOX_AND_MEDIA_CLASS} from '@components/rowFieldClasses';
import Section from '@components/section';
import {StorySettings} from '@appManagers/utils/stories/storySettings';
import {StoryPrivacyType} from '@appManagers/utils/stories/privacyType';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import styles from '@components/popups/storySettings.module.scss';

export type {StorySettings} from '@appManagers/utils/stories/storySettings';

export async function showStorySettingsForStory(props: {
  peerId: PeerId,
  storyId: number,
  onClose?: () => void,
  isRelevant?: () => boolean
}) {
  const manager = rootScope.managers.appStoriesManager;
  const initial = await manager.getStorySettings(props.peerId, props.storyId);
  if(props.isRelevant && !props.isRelevant()) {
    props.onClose?.();
    return;
  }
  showStorySettingsPopup({
    initial,
    editing: true,
    onSave: async(settings) => {
      const result = await manager.saveStorySettings(props.peerId, props.storyId, settings, initial);
      Object.assign(initial, result.applied);
      return result.saved;
    },
    onClose: props.onClose
  });
}

type AudienceOption = {
  type: StoryPrivacyType,
  title: LangPackKey,
  list: 'everyoneExcept' | 'contactsExcept' | 'closeFriends' | 'selectedContacts',
  pickerTitle: LangPackKey,
  icon: Icon,
  exclude?: boolean
};

const AUDIENCES: AudienceOption[] = [
  {type: 'public', title: 'ReactionsNotifyEveryone', list: 'everyoneExcept', pickerTitle: 'StoryPrivacyAlertExcludeFromEveryoneTitle', icon: 'channel_filled', exclude: true},
  {type: 'contacts', title: 'Contacts', list: 'contactsExcept', pickerTitle: 'StoryPrivacyAlertExcludedContactsTitle', icon: 'newprivate_filled', exclude: true},
  {type: 'close', title: 'StoryPrivacyOptionCloseFriends', list: 'closeFriends', pickerTitle: 'StoryPrivacyOptionCloseFriends', icon: 'star_filled'},
  {type: 'selected', title: 'StoryPrivacyOptionSelectedContacts', list: 'selectedContacts', pickerTitle: 'StoryPrivacyAlertSelectContactsTitle', icon: 'newgroup_filled'}
];

/** Edits local settings. The caller owns persistence, including personal account lists. */
export default function showStorySettingsPopup(props: {
  initial?: Partial<StorySettings>,
  editing?: boolean,
  periodHours?: number,
  onSave: (settings: StorySettings) => MaybePromise<void | boolean>,
  onClose?: () => void
}) {
  createPopup(() => {
    const initial = props.initial;
    const [settings, setSettings] = createStore<StorySettings>({
      peerType: initial?.peerType,
      privacyType: initial?.privacyType ?? 'public',
      everyoneExcept: [...initial?.everyoneExcept ?? []],
      contactsExcept: [...initial?.contactsExcept ?? []],
      closeFriends: [...initial?.closeFriends ?? []],
      selectedContacts: [...initial?.selectedContacts ?? []],
      hideFrom: [...initial?.hideFrom ?? []],
      allowScreenshots: initial?.allowScreenshots ?? true,
      keepOnPage: initial?.keepOnPage ?? true
    });
    const [saving, setSaving] = createSignal(false);
    const [error, setError] = createSignal(false);
    const name = createUniqueId();
    const isChatStory = () => !!settings.peerType;
    const keepTitle = () => settings.peerType === 'group' ? 'StoryKeepGroup' :
      settings.peerType === 'channel' ? 'StoryKeepChannel' : 'StoryKeep';
    const keepCaption = () => settings.peerType === 'group' ? 'StorySettingsKeepGroupInfo' :
      settings.peerType === 'channel' ? 'StorySettingsKeepChannelInfo' : 'StorySettingsKeepInfo';

    const editList = (list: AudienceOption['list'] | 'hideFrom', title: LangPackKey) => {
      if(saving()) return;
      showPickUserPopup({
        titleLangKey: title,
        placeholder: 'PrivacyModal.Search.Placeholder',
        peerType: ['contacts'],
        filterPeerTypeBy: (peer) => peer._ === 'user' && !peer.pFlags.bot && !peer.pFlags.deleted,
        exceptSelf: true,
        multiSelect: true,
        initial: [...settings[list]],
        footerButtonProps: {langKey: 'Save'},
        onSelect: (chosen) => {
          const peerIds = chosen.map(({peerId}) => peerId);
          setSettings(list, peerIds);
        }
      });
    };

    const selectAudience = (option: AudienceOption) => {
      setSettings('privacyType', option.type);
      if(!option.exclude && !settings[option.list].length) {
        editList(option.list, option.pickerTitle);
      }
    };

    const canSave = () => props.editing || isChatStory() || (settings.privacyType === 'close' ? !!settings.closeFriends.length :
      settings.privacyType === 'selected' ? !!settings.selectedContacts.length : true);
    const save = async() => {
      if(saving() || !canSave()) return false;
      setSaving(true);
      setError(false);
      try {
        const result = await props.onSave({
          ...settings,
          everyoneExcept: [...settings.everyoneExcept],
          contactsExcept: [...settings.contactsExcept],
          closeFriends: [...settings.closeFriends],
          selectedContacts: [...settings.selectedContacts],
          hideFrom: [...settings.hideFrom]
        });
        if(result === false) setError(true);
        return result;
      } catch{
        setError(true);
        return false;
      } finally {
        setSaving(false);
      }
    };

    return (
      <PopupElement class={styles.popup} show closable onClose={props.onClose}>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="StorySettings" />
        </PopupElement.Header>
        <PopupElement.Scrollable relative>
          <Show when={!isChatStory()}>
            <Section
              name="StorySettingsWhoCanView"
              nameRef={(element) => element.id = name + '-title'}
              caption={i18n(settings.hideFrom.length ? 'StorySettingsHiddenPeople' : 'StorySettingsPrivacyInfo', [
                anchorCallback(() => editList('hideFrom', 'StorySettingsHideFrom')),
                ...(settings.hideFrom.length ? [i18n('StoryPrivacyOptionPeople', [settings.hideFrom.length])] : [])
              ])}
              noShadow
            >
              <fieldset class={styles.fields} disabled={saving()} role="radiogroup" aria-labelledby={name + '-title'}>
                <For each={AUDIENCES}>{(option) => (
                  <Row class={ROW_WITH_CHECKBOX_AND_MEDIA_CLASS} disabled={saving()}>
                    <Row.RadioField>
                      <RadioFieldTsx
                        class={ROW_SELECTION_RADIO_CLASS}
                        name={name}
                        value={option.type}
                        ariaLabel={I18n.format(option.title, true)}
                        checked={settings.privacyType === option.type}
                        onChange={(checked) => checked && selectAudience(option)}
                      />
                    </Row.RadioField>
                    <Row.Media size="abitbigger" class={`${ROW_SELECTION_MEDIA_CLASS} ${styles.audienceIcon} privacy-bg privacy-bg-${option.type}`}>
                      <IconTsx icon={option.icon} />
                    </Row.Media>
                    <Row.Subtitle>
                      <a
                        href="#"
                        class="primary"
                        onClick={(event) => {
                          cancelEvent(event);
                          editList(option.list, option.pickerTitle);
                        }}
                      >
                        {i18n('StoryPrivacyOptionDetail', [settings[option.list].length ?
                          i18n(option.exclude ? 'StoryPrivacyOptionExcludePeople' : 'StoryPrivacyOptionPeople', [settings[option.list].length]) :
                          i18n(option.exclude ? 'StoryPrivacyOptionContactsDetail' : 'StoryPrivacyOptionCloseFriendsDetail')])}
                      </a>
                    </Row.Subtitle>
                    <Row.Title>{i18n(option.title)}</Row.Title>
                  </Row>
                )}</For>
              </fieldset>
            </Section>
          </Show>
          <Show when={!props.editing || isChatStory()}>
            <Section caption={keepCaption()} captionArgs={isChatStory() ? undefined : [i18n('Hours', [props.periodHours ?? 24])]} noShadow>
              <Show when={!props.editing}>
                <Row disabled={saving()}>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx toggle checked={settings.allowScreenshots} disabled={saving()} onChange={(value) => setSettings('allowScreenshots', value)} />
                  </Row.CheckboxFieldToggle>
                  <Row.Title>{i18n('StoryAllowScreenshots')}</Row.Title>
                </Row>
              </Show>
              <Row disabled={saving()}>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx toggle checked={settings.keepOnPage} disabled={saving()} onChange={(value) => setSettings('keepOnPage', value)} />
                </Row.CheckboxFieldToggle>
                <Row.Title>{i18n(keepTitle())}</Row.Title>
              </Row>
            </Section>
          </Show>
        </PopupElement.Scrollable>
        <PopupElement.Footer>
          <Show when={error()}><div class={styles.error} role="alert">{i18n('StorySettingsSaveError')}</div></Show>
          <PopupElement.FooterButton langKey="StoryPrivacyButtonSave" callback={save} disabled={saving() || !canSave()} confirm />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
