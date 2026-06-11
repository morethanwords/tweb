import EmojiDocumentIcon from '@components/emojiDocumentIcon';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import PopupElement from '@components/popups/indexTsx';
import ripple from '@components/ripple';
import Scrollable from '@components/scrollable2';
import SimpleFormField from '@components/simpleFormField';
import Space from '@components/space';
import {StaticCheckbox} from '@components/staticCheckbox';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {keepMe} from '@helpers/keepMe';
import {createMutation} from '@helpers/solid/createMutation';
import {I18nTsx} from '@helpers/solid/i18n';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {AiComposeTone} from '@layer';
import {CreateToneArgs} from '@lib/appManagers/aiTonesManager';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createMemo, createSignal, Match, mergeProps, ParentProps, Show, Switch} from 'solid-js';
import {useCreateToneLimits} from './limits';
import styles from './styles.module.scss';
import Button from '@components/buttonTsx';
import {Transition} from 'solid-transition-group';
import {LangPackKey} from '@lib/langPack';
import {AutoHeight} from '@components/autoHeight';
import {Skeleton} from '@components/skeleton';

keepMe(ripple);


export type ViewTonePopupProps = {
  tone: AiComposeTone.aiComposeTone;
  isSaved: boolean;
};

const ViewTonePopup = (props: ViewTonePopupProps) => {
  const {rootScope, toastNew, confirmationPopup} = useHotReloadGuard();

  const [docId, setDocId] = createSignal(props.tone.emoji_id);
  const [exampleNum, setExampleNum] = createSignal(1);

  const isCreator = () => props.tone.pFlags.creator;

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
    return rootScope.managers.aiTonesManager.saveToneById(props.tone.id, props.isSaved);
  }, {
    onError: () => toastNew({langPackKey: getErrorLangKey()}),
    onSuccess: () => toastNew({langPackKey: getSuccessLangKey()})
  });

  const onSubmit = wrapAsyncClickHandler(async() => {
    if(isCreator()) {
      try {
        await confirmationPopup({
          titleLangKey: 'AiEditor.DeleteStyle.Title',
          descriptionLangKey: 'AiEditor.DeleteStyle.Description',
          button: {langKey: 'Delete', isDanger: true}
        });
      } catch{
        return;
      }
    }
    await mutation.mutateAsync();
  });

  const Content = (props: ParentProps) => {
    return (
      <AutoHeight>
        <Transition name='fade-2'>
          <Show when={true} fallback={<Skeleton.Div class={styles.comparisonContentSkeleton} />}>
            <Scrollable relative class={styles.comparisonContent}>
              {props.children}
            </Scrollable>
          </Show>
        </Transition>
      </AutoHeight>
    );
  };

  return (
    <PopupElement class={styles.popup} containerClass={styles.popupContainer}>
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

        <div class={styles.description}>
          <I18nTsx key="AiEditor.ViewStyle.Description" />
        </div>

        <Space amount='1rem' />

        <div class={styles.comparison}>
          <div class={styles.comparisonHeader}>
            <I18nTsx key="AiEditor.ViewStyle.Before" />
            <Button class={styles.rotateButton} primaryTransparent>
              <IconTsx icon="rotate" />
              <I18nTsx key="AiEditor.ViewStyle.AnotherExample" />
            </Button>
          </div>
          <Content>...</Content>
          <div class={styles.comparisonDivider} />
          <div class={styles.comparisonHeader}>
            <I18nTsx key="AiEditor.ViewStyle.After" />
          </div>
          <Content>...</Content>
        </div>

      </PopupElement.Body>
      <PopupElement.Footer class={styles.popupFooter}>
        <PopupElement.FooterButton
          disabled={mutation.isPending()}
          color='danger'
          callback={onSubmit}
        >
          <Switch>
            <Match when={props.isSaved}>
              <I18nTsx key="AiEditor.ViewStyle.RemoveStyle" />
            </Match>
            <Match when={isCreator()}>
              <I18nTsx key="AiEditor.ViewStyle.DeleteStyle" />
            </Match>
            <Match when>
              <I18nTsx key="AiEditor.ViewStyle.SaveStyle" />
            </Match>
          </Switch>
        </PopupElement.FooterButton>
      </PopupElement.Footer>
    </PopupElement>
  );
};

export default ViewTonePopup;
