import {createMemo, createResource, createSignal, For, JSX, Show} from 'solid-js';
import confirmationPopup from '@components/confirmationPopup';
import InputField from '@components/inputField';
import MediaHeader from '@components/mediaHeader';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import UsernameRow from '@components/usernameRow';
import type {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import shareUrlToPeers from '@components/popups/shareUrl';
import attachPlainMessageEditor from '@components/chat/inputEditor/plainField';
import type {AppBusinessChatLinksTab} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {MarkupTooltipTypes} from '@components/chat/markupTooltip';
import {copyTextToClipboard} from '@helpers/clipboard';
import anchorCallback from '@helpers/dom/anchorCallback';
import {setDirection} from '@helpers/dom/setInnerHTML';
import {BusinessChatLink, User} from '@layer';
import {i18n} from '@lib/langPack';
import type {PreloadedLottieAsset} from '@lib/lottie/lottieLoader';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import type {AppManagers} from '@lib/managers';
import {useAppConfig} from '@stores/appState';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import getPrivacyRulesDetails from '@appManagers/utils/privacy/getPrivacyRulesDetails';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import type {BusinessChatLinkDraft} from '@appManagers/appBusinessManager';

type AppBusinessChatLinksTabType = typeof AppBusinessChatLinksTab;
type ChatLink = BusinessChatLink.businessChatLink;

export type BusinessChatLinksTabPayload = {
  animationData: PreloadedLottieAsset,
  links: MaybePromise<ChatLink[]>
};

/** What the clients take when the app config names no limit (tdesktop's fallback). */
const DEFAULT_LINKS_LIMIT = 100;
/** The name only the owner sees: Android's and iOS's cap on it. */
const BUSINESS_CHAT_LINK_NAME_MAX_LENGTH = 32;
/** The formatting a message typed into a chat carries — no rich-message blocks. */
const MESSAGE_FORMATTING: MarkupTooltipTypes[] = ['bold', 'italic', 'underline', 'strikethrough', 'monospace', 'spoiler', 'quote', 'link'];

const stripHttps = (link: string) => link.replace(/^https:\/\//, '');

const copyLink = (url: string) => {
  copyTextToClipboard(url);
  toastNew({langPackKey: 'LinkCopied'});
};

const BusinessChatLinksTab = () => {
  const [tab] = useSuperTab<AppBusinessChatLinksTabType>();
  const promiseCollector = usePromiseCollector();

  // * a failed request opens the tab empty rather than not at all
  const loadPromise = Promise.resolve(tab.payload.links).catch((err): ChatLink[] => {
    console.error('getBusinessChatLinks error:', err);
    toastNew({langPackKey: 'Error.AnError'});
    return [];
  });
  promiseCollector.collect(loadPromise);

  const [links] = createResource(() => loadPromise);

  return (
    <>
      <MediaHeader marginBottom>
        <MediaHeader.Sticker animationData={tab.payload.animationData} size={130} restartOnClick={false} />
        <MediaHeader.Title>{i18n('PremiumBusinessChatLinks')}</MediaHeader.Title>
        <MediaHeader.Subtitle>{i18n('BusinessLinksInfo')}</MediaHeader.Subtitle>
      </MediaHeader>
      <Show when={links()}>
        <BusinessChatLinksList links={links()} />
      </Show>
    </>
  );
};

export default BusinessChatLinksTab;

/**
 * The message a link fills the composer with: a field with the chat input's formatting, in the same
 * box as the fact check's. Resolves with nothing when it is cancelled.
 */
async function editLinkMessage(
  managers: AppManagers,
  link?: ChatLink
): Promise<Pick<BusinessChatLinkDraft, 'message' | 'entities'>> {
  const {message_length_max: maxLength} = await managers.apiManager.getConfig();
  const inputField = new InputField({
    placeholder: 'BusinessLinksEnter',
    withLinebreaks: true,
    maxLength,
    canHaveFormatting: MESSAGE_FORMATTING
  });
  const editor = attachPlainMessageEditor(inputField.input);
  if(link?.message) {
    inputField.setValueSilently({text: link.message, entities: link.entities});
  }

  try {
    await confirmationPopup({
      titleLangKey: link ? 'BusinessLinkEditTitle' : 'BusinessLinkNewTitle',
      descriptionLangKey: 'BusinessLinksIntro',
      inputField,
      button: {langKey: link ? 'Save' : 'Create'}
    });
    const {value, entities} = editor.getRichValue(true);
    return {message: value, entities};
  } catch{
    return;
  } finally {
    editor.destroy();
  }
}

/** The name only the owner sees, in Android's rename box. Resolves with nothing when it is cancelled. */
async function editLinkName(link: ChatLink): Promise<string> {
  const inputField = new InputField({
    label: 'BusinessLinksNamePlaceholder',
    plainText: true,
    maxLength: BUSINESS_CHAT_LINK_NAME_MAX_LENGTH
  });
  inputField.setValueSilently(link.title || '');

  try {
    await confirmationPopup({
      titleLangKey: 'BusinessLinksRenameTitle',
      descriptionLangKey: 'BusinessLinksRenameMessage',
      inputField,
      button: {langKey: 'Done'}
    });
    return inputField.value.trim();
  } catch{
    return;
  }
}

function BusinessChatLinksList(props: {links: ChatLink[]}) {
  const [tab] = useSuperTab<AppBusinessChatLinksTabType>();
  const managers = tab.managers;
  const appConfig = useAppConfig();
  // * the newest first, as tdesktop lists them: the server sends them oldest first
  const [links, setLinks] = createSignal(props.links.slice().reverse());
  const [creating, setCreating] = createSignal(false);

  const linksLimit = () => appConfig.business_chat_links_limit || DEFAULT_LINKS_LIMIT;
  const simpleLinksCaption = createSimpleLinksCaption(managers);
  const replaceLink = (link: ChatLink) => {
    setLinks((links) => links.map((item) => item.link === link.link ? link : item));
  };
  // * a menu keeps the row it was opened on: an edit saved meanwhile has changed it since
  const latest = (link: ChatLink) => links().find((item) => item.link === link.link) || link;

  const create = async() => {
    if(creating()) return;
    const message = await editLinkMessage(managers);
    if(!message) return;

    setCreating(true);
    try {
      const link = await managers.appBusinessManager.createBusinessChatLink(message);
      setLinks((links) => [link, ...links]);
      toastNew({langPackKey: 'BusinessLinkSaved'});
    } catch(err) {
      console.error('createBusinessChatLink error:', err);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setCreating(false);
    }
  };

  /**
   * Sends only the part the user changed: the manager puts one link's edits out one at a time and takes
   * the rest from what the edits before left, so a rename does not bring back the message an edit on its
   * way replaces.
   */
  const edit = async(link: ChatLink, changes: Partial<BusinessChatLinkDraft>, savedLangKey?: 'BusinessLinkSaved') => {
    try {
      replaceLink(await managers.appBusinessManager.editBusinessChatLink(link.link, changes));
      if(savedLangKey) toastNew({langPackKey: savedLangKey});
    } catch(err) {
      console.error('editBusinessChatLink error:', err);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  const editMessage = async(link: ChatLink) => {
    const message = await editLinkMessage(managers, latest(link));
    if(message) edit(link, message, 'BusinessLinkSaved');
  };

  const rename = async(link: ChatLink) => {
    const title = await editLinkName(latest(link));
    if(title !== undefined && title !== (latest(link).title || '')) edit(link, {title});
  };

  const remove = async(link: ChatLink) => {
    try {
      await confirmationPopup({
        titleLangKey: 'BusinessLinksDeleteTitle',
        descriptionLangKey: 'BusinessLinksDeleteMessage',
        button: {langKey: 'Delete', isDanger: true}
      });
    } catch{
      return;
    }

    try {
      await managers.appBusinessManager.deleteBusinessChatLink(link.link);
      setLinks((links) => links.filter((item) => item.link !== link.link));
      toastNew({langPackKey: 'BusinessLinkDeleted'});
    } catch(err) {
      console.error('deleteBusinessChatLink error:', err);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  // * a click on a link opens its menu, as tdesktop's list does
  const menuButtons = (link: ChatLink): ButtonMenuItemOptionsVerifiable[] => [{
    icon: 'copy',
    text: 'Copy',
    onClick: () => copyLink(link.link)
  }, {
    icon: 'forward',
    text: 'Share',
    onClick: () => shareUrlToPeers({url: link.link})
  }, {
    icon: 'tag_name',
    text: 'Rename',
    onClick: () => rename(link)
  }, {
    icon: 'edit',
    text: 'Edit',
    onClick: () => editMessage(link)
  }, {
    icon: 'delete',
    text: 'Delete',
    danger: true,
    onClick: () => remove(link)
  }];

  return (
    <Section caption={simpleLinksCaption()}>
      <Show when={links().length < linksLimit()}>
        <Row clickable={create} disabled={creating()}>
          <Row.Icon icon="add" />
          <Row.Title class="primary">{i18n('BusinessLinksAdd')}</Row.Title>
        </Row>
      </Show>
      <For each={links()}>{(link) => <BusinessChatLinkRow link={link} menuButtons={menuButtons(link)} />}</For>
    </Section>
  );
}

function BusinessChatLinkRow(props: {link: ChatLink, menuButtons: ButtonMenuItemOptionsVerifiable[]}) {
  const [tab] = useSuperTab<AppBusinessChatLinksTabType>();
  const title = () => {
    if(props.link.title) return props.link.title;
    // * a link reads left to right by its own letters, yet sits at the start of the row in RTL
    const span = document.createElement('span');
    setDirection(span);
    span.textContent = stripHttps(props.link.link);
    return span;
  };

  return (
    <UsernameRow
      ref={(element) => element.setAttribute('aria-haspopup', 'menu')}
      contextMenu={{buttons: props.menuButtons, middleware: tab.middlewareHelper.get()}}
      isLink
      title={title()}
      titleRight={props.link.views ? i18n('Clicks', [props.link.views]) : i18n('NoClicks')}
      titleRightSecondary
      subtitle={wrapRichText(props.link.message, {
        entities: props.link.entities,
        noLinks: true,
        noLinebreaks: true,
        middleware: tab.middlewareHelper.get()
      })}
    />
  );
}

/**
 * "You can also use a simple link…": the username's link, and the phone's while the number can lead
 * anyone to the chat — Android's rule: it is shown to someone, or anyone may find the account by it.
 * A click copies either.
 */
function createSimpleLinksCaption(managers: AppManagers) {
  const user = apiManagerProxy.getUser(rootScope.myId.toUserId()) as User.user;
  const username = user && getPeerActiveUsernames(user)[0];

  // * a failure to read the rules leaves the phone's link out
  const [phoneLinkAllowed] = createResource(() => user?.phone ? Promise.all([
    managers.appPrivacyManager.getPrivacy('inputPrivacyKeyPhoneNumber'),
    managers.appPrivacyManager.getPrivacy('inputPrivacyKeyAddedByPhone')
  ]).then(([phoneRules, addedByPhoneRules]) => (
    getPrivacyRulesDetails(phoneRules).type !== PrivacyType.Nobody ||
    getPrivacyRulesDetails(addedByPhoneRules).type !== PrivacyType.Contacts
  ), () => false) : false);

  const makeLink = (path: string) => {
    const a = anchorCallback(() => copyLink('https://t.me/' + path));
    a.textContent = 't.me/' + path;
    a.dir = 'ltr';
    return a;
  };

  return createMemo((): JSX.Element => {
    const links = [
      username && makeLink(username),
      phoneLinkAllowed() && makeLink('+' + user.phone)
    ].filter(Boolean);
    if(!links.length) return;
    return i18n(links.length > 1 ? 'BusinessLinksFooterTwoLinks' : 'BusinessLinksFooterOneLink', links);
  });
}
