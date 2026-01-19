import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppPasskeysTab} from '@components/solidJsTabs';
import anchorCallback from '@helpers/dom/anchorCallback';
import StickerAndTitle from '@components/stickerAndTitle';
import {createEffect, createSignal, For, Show} from 'solid-js';
import {formatFullSentTime} from '@helpers/date';
import createMiddleware from '@helpers/solid/createMiddleware';
import styles from '@components/sidebarLeft/tabs/passkeys.module.scss';
import {Passkey} from '@layer';
import showPasskeyPopup, {createPasskey} from '@components/popups/passkey';
import IS_WEB_AUTHN_SUPPORTED from '@environment/webAuthn';
import Button from '@components/buttonTsx';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import findAndSplice from '@helpers/array/findAndSplice';
import {useAppConfig} from '@stores/appState';

type AppPasskeysTabClass = typeof AppPasskeysTab;

const PasskeyItem = (passkey: Passkey) => {
  const [tab] = useSuperTab<AppPasskeysTabClass>();
  const {rootScope, wrapEmojiText, wrapAdaptiveCustomEmoji, Row, i18n, confirmationPopup, formatDate} = useHotReloadGuard();
  const [disabled, setDisabled] = createSignal(false);
  const subtitle = () => {
    const created = i18n('Privacy.Passkey.Created', [formatDate(new Date(passkey.date * 1000), {withTime: true})]);
    if(!passkey.last_usage_date) return created;
    const lastUsed = i18n('Privacy.Passkey.LastUsage', [formatDate(new Date(passkey.last_usage_date * 1000), {withTime: true})]);
    return [created, ' • ', lastUsed];
  };
  return (
    <Row
      disabled={disabled()}
      contextMenu={{
        buttons: [{
          icon: 'delete',
          text: 'Delete',
          onClick: async() => {
            await confirmationPopup({
              titleLangKey: 'Passkey.Deletion.Title',
              descriptionLangKey: 'Passkey.Deletion.Text',
              button: {
                langKey: 'Delete',
                isDanger: true
              }
            });

            setDisabled(true);
            rootScope.managers.appAccountManager.deletePasskey(passkey.id).finally(() => {
              tab.payload.setPasskeys((passkeys) => {
                const arr = [...passkeys];
                findAndSplice(arr, (item) => item.id === passkey.id);
                return arr;
              });
            });
          },
          danger: true
        }]
      }}
    >
      <Show when={!passkey.software_emoji_id}>
        <Row.Icon icon="key" />
      </Show>
      <Row.Title class="text-bold">{wrapEmojiText(passkey.name)}</Row.Title>
      <Row.Subtitle>{subtitle()}</Row.Subtitle>
      <Show when={passkey.software_emoji_id}>
        <Row.Media size="abitbigger">
          {wrapAdaptiveCustomEmoji({
            docId: passkey.software_emoji_id,
            size: 42,
            wrapOptions: {
              middleware: createMiddleware().get()
            }
          }).container}
        </Row.Media>
      </Show>
    </Row>
  );
};

const PasskeysTab = () => {
  const [tab] = useSuperTab<AppPasskeysTabClass>();
  const {i18n} = useHotReloadGuard();
  const appConfig = useAppConfig();

  const onCreation = (passkey: Passkey) => {
    tab.payload.setPasskeys((passkeys) => {
      const arr = [...passkeys];
      arr.unshift(passkey);
      return arr;
    });
  };

  createEffect(() => {
    if(!tab.payload.passkeys.length && !IS_WEB_AUTHN_SUPPORTED) {
      tab.close();
    }
  });

  return (
    <Section
      class={styles.container}
      caption="Privacy.Passkeys.Caption"
      captionArgs={[anchorCallback(() => showPasskeyPopup(onCreation))]}
    >
      <StickerAndTitle
        sticker={{name: 'key', size: 100}}
        subtitle={i18n('Passkey.Subtitle')}
        subtitleSecondary
      />
      <div class={styles.items}>
        <For each={tab.payload.passkeys}>
          {PasskeyItem}
        </For>
        <Show
          when={
            IS_WEB_AUTHN_SUPPORTED &&
            tab.payload.passkeys.length < appConfig.passkeys_account_passkeys_max
          }
        >
          <Button
            text="Privacy.Passkey.Create"
            primaryTransparent
            icon="add"
            onClick={() => createPasskey().then(onCreation)}
          />
        </Show>
      </div>
    </Section>
  );
};

export default PasskeysTab;
