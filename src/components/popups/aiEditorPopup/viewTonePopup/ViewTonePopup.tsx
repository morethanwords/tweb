import {AutoHeight} from '@components/autoHeight';
import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import {IconTsx} from '@components/iconTsx';
import PopupElement from '@components/popups/indexTsx';
import ripple from '@components/ripple';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import Space from '@components/space';
import {keepMe} from '@helpers/keepMe';
import createMiddleware from '@helpers/solid/createMiddleware';
import {createMutation} from '@helpers/solid/createMutation';
import {I18nTsx} from '@helpers/solid/i18n';
import {AiComposeTone} from '@layer';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createMemo, createResource, createSignal, Match, Show, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './styles.module.scss';
import {useMaxSavedTones} from '../limits';

keepMe(ripple);


export type ViewTonePopupProps = {
  tone: AiComposeTone.aiComposeTone;
  isSaved: boolean;
  savedTones: number;
};

const ViewTonePopup = (props: ViewTonePopupProps) => {
  const {rootScope, toastNew, confirmationPopup, wrapRichText, useAppConfig, PeerTitleTsx, appImManager} = useHotReloadGuard();

  const appConfig = useAppConfig();
  const maxNum = appConfig.aicompose_tone_examples_num || 3;
  const maxSavedTones = useMaxSavedTones();

  const [show, setShow] = createSignal(true);

  const [docId, setDocId] = createSignal(props.tone.emoji_id);
  const [exampleNum, setExampleNum] = createSignal(props.tone.example_english ? 1 : 0);
  const [canFetch, setCanFetch] = createSignal(exampleNum() === 0);

  const [example] = createResource(
    () => canFetch() ? exampleNum() : undefined,
    (num) => rootScope.managers.aiTonesManager.fetchExample(props.tone, num),
    {initialValue: props.tone.example_english} as {}
  );

  const isCreator = () => props.tone.pFlags.creator;
  const canHaveMoreTones = () => props.savedTones < maxSavedTones();

  const hasFooterButton = createMemo(() => props.isSaved || isCreator() || canHaveMoreTones());

  const getErrorLangKey = (): LangPackKey => {
    if(isCreator() || props.isSaved) return 'AiEditor.StyleRemoveError';
    return 'AiEditor.StyleAddError';
  };

  const getSuccessLangKey = (): LangPackKey => {
    if(isCreator() || props.isSaved) return 'AiEditor.StyleRemoved';
    return 'AiEditor.StyleAdded';
  };

  const mutation = createMutation(() => {
    if(isCreator()) return rootScope.managers.aiTonesManager.deleteTone(props.tone.id);
    if(canHaveMoreTones()) return rootScope.managers.aiTonesManager.saveTone(props.tone, props.isSaved);
    return Promise.reject();
  }, {
    onError: () => toastNew({langPackKey: getErrorLangKey()}),
    onSuccess: () => toastNew({langPackKey: getSuccessLangKey()})
  });

  const onAnotherExample = () => {
    if(exampleNum() >= maxNum) return;
    batch(() => {
      setExampleNum(exampleNum() + 1);
      setCanFetch(true);
    });
  };

  const onSubmit = async() => {
    if(isCreator()) {
      try {
        await confirmationPopup({
          titleLangKey: 'AiEditor.DeleteStyle.Title',
          descriptionLangKey: 'AiEditor.DeleteStyle.Description',
          button: {langKey: 'Delete', isDanger: true}
        });
      } catch{
        return false;
      }
    }
    await mutation.mutateAsync();
    return true;
  };

  const Content = (props: { final?: boolean }) => {
    return (
      <AutoHeight>
        <Transition name='fade-2' mode='outin'>
          <Show
            when={example.state === 'ready' && (props.final ? example().to : example().from)}
            fallback={
              <div class={styles.comparisonContentSkeletonWrapper}>
                <Skeleton.Div secondary class={styles.comparisonContentSkeleton} />
              </div>
            }
            keyed
          >
            {(content) => (
              <Scrollable relative class={styles.comparisonContent}>
                {wrapRichText(content.text, {
                  entities: content.entities,
                  middleware: createMiddleware().get()
                })}
              </Scrollable>
            )}
          </Show>
        </Transition>
      </AutoHeight>
    );
  };

  const CreatorLink = (props: { peerId: number }) => (
    <span class={styles.creatorLink} use:ripple onClick={() => {
      appImManager.setInnerPeer({peerId: props.peerId});
      setShow(false);
    }}>
      <PeerTitleTsx peerId={props.peerId} limitSymbols={32} />
    </span>
  );

  return (
    <PopupElement class={styles.popup} containerClass={styles.popupContainer} show={show()}>
      <PopupElement.Header class={styles.popupHeader}>
        <PopupElement.CloseButton class={styles.popupCloseButton} />
      </PopupElement.Header>
      <PopupElement.Body class={styles.popupBody}>
        <Show when={docId()} keyed>
          {(docId) => (
            <div class={styles.header}>
              <div class={styles.emojiButton}>
                <div class={styles.emoji}>
                  <EmojiDocumentIcon
                    docId={docId}
                    managers={rootScope.managers}
                    color='primary-text-color'
                    size={64}
                    onFail={() => setDocId()}
                  />
                </div>
              </div>
            </div>
          )}
        </Show>

        <div class={styles.title}>
          {props.tone.title}
        </div>
        <div class={styles.description}>
          <I18nTsx key="AiEditor.ViewStyle.Description" />
        </div>

        <Space amount='1rem' />

        <div class={styles.comparison}>
          <div class={styles.comparisonHeader}>
            <I18nTsx key="AiEditor.ViewStyle.Before" />
            <Transition name='fade-2'>
              <Show when={exampleNum() < maxNum}>
                <div class={styles.anotherExampleButton} onClick={onAnotherExample} use:ripple>
                  <IconTsx icon="flip" />
                  <I18nTsx key="AiEditor.ViewStyle.AnotherExample" />
                </div>
              </Show>
            </Transition>
          </div>
          <Content />
          <div class={styles.comparisonDivider} />
          <div class={styles.comparisonHeader}>
            <I18nTsx key="AiEditor.ViewStyle.After" />
          </div>
          <Content final />
        </div>

        <Space amount='0.75rem' />

        <Switch>
          <Match when={!isCreator() && props.tone.author_id} keyed>
            {(authorId) => (
              <div class={styles.note}>
                <I18nTsx key="AiEditor.ViewStyle.CreatedBy" args={[<CreatorLink peerId={authorId.toPeerId()} />]} />
              </div>
            )}
          </Match>
          <Match when={isCreator() && props.tone.installs_count} keyed>
            {(installsCount) => (
              <div class={styles.note}>
                <I18nTsx
                  key="AiEditor.ViewStyle.InstallsCount"
                  args={[installsCount.toString()]}
                />
              </div>
            )}
          </Match>
        </Switch>

        <Show when={!hasFooterButton()}>
          <Space amount='1rem' />
          <div class={styles.note}>
            <I18nTsx key="AiEditor.ViewStyle.MaxSavedTones" />
          </div>
        </Show>
      </PopupElement.Body>
      <Show when={hasFooterButton()}>
        <PopupElement.Footer class={styles.popupFooter}>
          <PopupElement.FooterButton
            disabled={mutation.isPending()}
            color={isCreator() || props.isSaved ? 'danger' : 'primary'}
            callback={onSubmit}
          >
            <Switch>
              <Match when={props.isSaved}>
                <I18nTsx key="AiEditor.ViewStyle.RemoveStyle" />
              </Match>
              <Match when={isCreator()}>
                <I18nTsx key="AiEditor.ViewStyle.DeleteStyle" />
              </Match>
              <Match when={canHaveMoreTones()}>
                <I18nTsx key="AiEditor.ViewStyle.SaveStyle" />
              </Match>
            </Switch>
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </Show>
    </PopupElement>
  );
};

export default ViewTonePopup;
