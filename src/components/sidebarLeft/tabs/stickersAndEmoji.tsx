import {Component, createResource, onMount} from 'solid-js';
import assumeType from '@helpers/assumeType';
import createContextMenu from '@helpers/dom/createContextMenu';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import Sortable from '@helpers/dom/sortable';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {StickerSet, MessagesAllStickers} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import LazyLoadQueue from '@components/lazyLoadQueue';
import showStickersPopup from '@components/popups/stickers';
import Row from '@components/rowTsx';
import SettingSection from '@components/settingSection';
import wrapStickerSetThumb from '@components/wrappers/stickerSetThumb';
import ReactionStickerPreview from '@components/reactionStickerPreview';
import {AppQuickReactionTab} from '@components/solidJsTabs/tabs';
import {useAppSettings} from '@stores/appSettings';
import {getStickerSetInputById} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {renderComponent} from '@helpers/solid/renderComponent';
import {IconTsx} from '@components/iconTsx';
import {mountSolidComponent} from '@helpers/solid/wrapSolidComponent';

const StickersAndEmoji: Component = () => {
  const [tab] = useSuperTab();
  const [appSettings, setAppSettings] = useAppSettings();
  const promiseCollector = usePromiseCollector();
  const [quickReactionDoc, {refetch: refetchQuickReaction}] = createResource(async() => {
    const reaction = await tab.managers.appReactionsManager.getQuickReaction();
    return reaction._ === 'availableReaction' ?
      reaction.static_icon :
      tab.managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id);
  });

  onMount(() => {
    tab.container.classList.add('stickers-emoji-container');

    const allStickersPromise = tab.managers.appStickersManager.getAllStickers();

    const promises: Promise<any>[] = [];

    {
      const section = new SettingSection({caption: 'LoopAnimatedStickersInfo'});
      let suggestStickersRow: HTMLElement;

      const map: {[k in typeof appSettings.stickers.suggest]: LangPackKey} = {
        all: 'SuggestStickersAll',
        installed: 'SuggestStickersInstalled',
        none: 'SuggestStickersNone'
      };

      const setStickersSuggest = (value: typeof appSettings.stickers.suggest) => {
        if(appSettings.stickers.suggest === value) return;
        setAppSettings('stickers', 'suggest', value);
      };

      renderComponent({
        element: section.content,
        Component: () => (
          <>
            <Row
              havePadding
              clickable={() => tab.slider.createTab(AppQuickReactionTab).open()}
            >
              <Row.Title>{i18n('DoubleTapSetting')}</Row.Title>
            <ReactionStickerPreview sticker={quickReactionDoc()} />
            </Row>
            <Row ref={suggestStickersRow} clickable>
              <Row.Icon icon="lamp_filled" />
              <Row.Title
                titleRight={i18n(map[appSettings.stickers.suggest])}
                titleRightSecondary
              >
                {i18n('Stickers.SuggestStickers')}
              </Row.Title>
            </Row>
            <Row>
              <Row.Icon icon="flip" />
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx
                  stateKey={joinDeepPath('settings', 'stickers', 'loop')}
                  toggle
                />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n('InstalledStickers.LoopAnimated')}</Row.Title>
            </Row>
          </>
        ),
        middleware: tab.middlewareHelper.get()
      });

      createContextMenu({
        buttons: [{
          icon: 'stickers_face',
          text: 'SuggestStickersAll',
          onClick: setStickersSuggest.bind(null, 'all')
        }, {
          icon: 'newprivate',
          text: 'SuggestStickersInstalled',
          onClick: setStickersSuggest.bind(null, 'installed')
        }, {
          icon: 'stop',
          text: 'SuggestStickersNone',
          onClick: setStickersSuggest.bind(null, 'none')
        }],
        listenTo: suggestStickersRow,
        middleware: tab.middlewareHelper.get(),
        listenForClick: true
      });

      tab.listenerSetter.add(rootScope)('quick_reaction', () => {
        refetchQuickReaction();
      });

      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'Emoji'});
      renderComponent({
        element: section.content,
        Component: () => (
          <>
            <Row>
              <Row.Icon icon="lamp_filled" />
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx
                  stateKey={joinDeepPath('settings', 'emoji', 'suggest')}
                  toggle
                />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n('GeneralSettings.EmojiPrediction')}</Row.Title>
            </Row>
            <Row>
              <Row.Icon icon="emoji_filled" />
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx
                  stateKey={joinDeepPath('settings', 'emoji', 'big')}
                  toggle
                />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n('GeneralSettings.BigEmoji')}</Row.Title>
            </Row>
          </>
        ),
        middleware: tab.middlewareHelper.get()
      });

      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'DynamicPackOrder', caption: 'DynamicPackOrderInfo'});
      renderComponent({
        element: section.content,
        Component: () => (
          <Row>
            <Row.Icon icon="replace_squares" />
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                stateKey={joinDeepPath('settings', 'stickers', 'dynamicPackOrder')}
                toggle
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('DynamicPackOrder')}</Row.Title>
          </Row>
        ),
        middleware: tab.middlewareHelper.get()
      });

      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({name: 'Telegram.InstalledStickerPacksController', caption: 'StickersBotInfo'});

      const stickerSets: {[id: string]: {container: HTMLElement, dispose: VoidFunction}} = {};

      const stickersContent = section.generateContentElement();

      const lazyLoadQueue = new LazyLoadQueue();
      const renderStickerSet = (stickerSet: StickerSet.stickerSet, method: 'append' | 'prepend' = 'append') => {
        const media = document.createElement('div');
        const mounted = mountSolidComponent((middleware) => {
          wrapStickerSetThumb({
            set: stickerSet,
            container: media,
            group: 'GENERAL-SETTINGS',
            lazyLoadQueue,
            width: 36,
            height: 36,
            autoplay: true,
            middleware
          });

          return (
            <Row
              class="row-sortable"
              havePadding
              clickable={() => showStickersPopup(getStickerSetInputById(stickerSet))}
            >
              <Row.Title>{wrapEmojiText(stickerSet.title)}</Row.Title>
              <Row.Subtitle>{i18n('Stickers', [stickerSet.count])}</Row.Subtitle>
              <Row.Media element={media} />
              <IconTsx icon="menu" class="row-sortable-icon" />
            </Row>
          );
        }, tab.middlewareHelper.get());
        const row = mounted.element;

        row.dataset.id = '' + stickerSet.id;
        stickerSets[stickerSet.id] = {container: row, dispose: mounted.dispose};

        stickersContent[method](row);
      };

      const promise = allStickersPromise.then((allStickers) => {
        assumeType<MessagesAllStickers.messagesAllStickers>(allStickers);
        const promises = allStickers.sets.map((stickerSet) => renderStickerSet(stickerSet));
        return Promise.all(promises);
      });

      promises.push(promise);

      tab.listenerSetter.add(rootScope)('stickers_installed', (set) => {
        if(!stickerSets[set.id]) {
          renderStickerSet(set, 'prepend');
        }
      });

      tab.listenerSetter.add(rootScope)('stickers_deleted', (set) => {
        const row = stickerSets[set.id];
        if(row) {
          row.dispose();
          row.container.remove();
          delete stickerSets[set.id];
        }
      });

      tab.listenerSetter.add(rootScope)('stickers_order', ({type, order}) => {
        if(type !== 'stickers') {
          return;
        }

        order.forEach((id, idx) => {
          const row = stickerSets[id];
          if(!row) {
            return;
          }

          positionElementByIndex(row.container, stickersContent, idx);
        });
      });

      tab.listenerSetter.add(rootScope)('stickers_top', (id) => {
        const row = stickerSets[id];
        if(!row) {
          return;
        }

        positionElementByIndex(row.container, stickersContent, 0);
      });

      new Sortable({
        list: stickersContent,
        middleware: tab.middlewareHelper.get(),
        onSort: (idx, newIdx) => {
          const order = Array.from(stickersContent.children).map((el) => (el as HTMLElement).dataset.id);
          tab.managers.appStickersManager.reorderStickerSets(order);
        }
      });

      tab.scrollable.append(section.container);
    }

    promiseCollector.collect(Promise.all(promises));
  });

  return null;
};

export default StickersAndEmoji;
