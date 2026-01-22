import Button from '@components/buttonTsx';
import RangeSettingSelector from '@components/rangeSettingSelector';
import Section from '@components/section';
import Space from '@components/space';
import {I18nTsx} from '@helpers/solid/i18n';
import type {FormatterArguments, LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import styles from './storageQuota.module.scss';
import CacheStorageController, {CacheStorageDbName} from '@lib/files/cacheStorage';
import {createResource, Match, Resource, Switch} from 'solid-js';
import formatBytes from '@helpers/formatBytes';


type ConfirmationArgs = {
  titleLangKey: LangPackKey;
  descriptionLangKey: LangPackKey;
  descriptionLangArgs?: FormatterArguments;
};

const getClearCachedFilesArgs = (size: string): ConfirmationArgs => ({
  titleLangKey: 'StorageQuota.ClearCachedFiles',
  descriptionLangKey: 'StorageQuota.ClearConfirmation',
  descriptionLangArgs: [size]
});

const getClearStreamChunksArgs = (size: string): ConfirmationArgs => ({
  titleLangKey: 'StorageQuota.ClearCachedStreamChunks',
  descriptionLangKey: 'StorageQuota.ClearConfirmation',
  descriptionLangArgs: [size]
});

const getClearAllArgs = (): ConfirmationArgs => ({
  titleLangKey: 'StorageQuota.ClearAll',
  descriptionLangKey: 'StorageQuota.ClearAllConfirmation'
});

type CollectedCategory = 'images' | 'videos' | 'stickers' | 'other';

async function collectCachedFilesSizes() {
  const collectedSizeByTypes: Record<CollectedCategory, number> = {
    images: 0,
    videos: 0,
    stickers: 0,
    other: 0
  };
  let totalSize = 0;

  const storage = new CacheStorageController('cachedFiles');

  await storage.minimalBlockingIterateResponses((response) => {
    const headers = response.headers;

    const contentSize = getContentSizeFromHeaders(headers);
    if(!contentSize) return;

    const contentType = headers.get('content-type');

    const category: CollectedCategory =
      contentType?.startsWith('image/') ? 'images' :
        contentType?.startsWith('video/') ? 'videos' :
          contentType?.startsWith('application/json') ? 'stickers' : 'other';

    collectedSizeByTypes[category] += contentSize;
    totalSize += contentSize;
  }).finally(() => {
    storage.forget();
  });


  return {
    totalSize,
    collectedSizeByTypes
  };
};

async function collectCachedVideoStreamChunksSize() {
  const storagesToCount: CacheStorageDbName[] = [
    'cachedStreamChunks',
    'cachedHlsStreamChunks',
    'cachedHlsQualityFiles'
  ];

  let totalSize = 0;

  for(const storageName of storagesToCount) {
    const storage = new CacheStorageController(storageName);

    await storage.minimalBlockingIterateResponses((response) => {
      const headers = response.headers;

      const contentSize = getContentSizeFromHeaders(headers);
      if(!contentSize) return;

      totalSize += contentSize;
    }).finally(() => {
      storage.forget();
    });
  }

  return totalSize;
}

function getContentSizeFromHeaders(headers: Headers): number {
  const contentSize = parseInt(headers.get('content-length') || '0');
  if(!contentSize) return 0;

  return contentSize;
}

const SizeWithFallback = (props: {
  resource: Resource<any>;
  value: number;
}) => (
  <Switch>
    <Match when={props.resource.loading}>
      <I18nTsx key='Loading' />
    </Match>
    <Match when={props.resource.state === 'ready'}>
      {formatBytes(props.value, 1)}
    </Match>
    <Match when>
      <I18nTsx key='StorageQuota.FailedToCalculate' />
    </Match>
  </Switch>
);

export const StorageQuota = () => {
  const {Row, confirmationPopup, i18n} = useHotReloadGuard();

  const [cachedFilesSizes] = createResource(() => collectCachedFilesSizes());
  const [cachedVideoStreamChunksSize] = createResource(() => collectCachedVideoStreamChunksSize());

  const btnClass = `${styles.Button} primary btn`;

  const getConfirmation = async(args: ConfirmationArgs) => {
    try {
      await confirmationPopup({
        ...args,
        button: {
          text: i18n('StorageQuota.Clear')
        }
      });
      return true;
    } catch{
      return false;
    }
  };

  return (
    <Section name='StorageQuota.Title'>
      <Row>
        <Row.Title><I18nTsx key='StorageQuota.CachedFiles' /></Row.Title>
        <Row.Subtitle><SizeWithFallback resource={cachedFilesSizes} value={cachedFilesSizes()?.totalSize} /></Row.Subtitle>
        <Row.RightContent>
          <div>
            <Button class={btnClass} onClick={() => {
              getConfirmation(getClearCachedFilesArgs('100 MB'));
            }}>
              <I18nTsx key='StorageQuota.Clear' />
            </Button>
          </div>
        </Row.RightContent>
      </Row>

      <Row>
        <Row.Icon icon='image' />
        <Row.Title><I18nTsx key='StorageQuota.Images' /></Row.Title>
        <Row.Subtitle><SizeWithFallback resource={cachedFilesSizes} value={cachedFilesSizes()?.collectedSizeByTypes['images']} /></Row.Subtitle>
      </Row>

      <Row>
        <Row.Icon icon='play' />
        <Row.Title><I18nTsx key='StorageQuota.VideoFiles' /></Row.Title>
        <Row.Subtitle><SizeWithFallback resource={cachedFilesSizes} value={cachedFilesSizes()?.collectedSizeByTypes['videos']} /></Row.Subtitle>
      </Row>

      <Row>
        <Row.Icon icon='stickers_face' />
        <Row.Title><I18nTsx key='StorageQuota.StickersEmoji' /></Row.Title>
        <Row.Subtitle><SizeWithFallback resource={cachedFilesSizes} value={cachedFilesSizes()?.collectedSizeByTypes['stickers']} /></Row.Subtitle>
      </Row>

      <Row>
        <Row.Icon icon='limit_file' />
        <Row.Title><I18nTsx key='StorageQuota.Other' /></Row.Title>
        <Row.Subtitle><SizeWithFallback resource={cachedFilesSizes} value={cachedFilesSizes()?.collectedSizeByTypes['other']} /></Row.Subtitle>
      </Row>

      <Space amount='1rem' />

      <Row>
        <Row.Title><I18nTsx key='StorageQuota.CachedStreamChunks' /></Row.Title>
        <Row.Subtitle><SizeWithFallback resource={cachedVideoStreamChunksSize} value={cachedVideoStreamChunksSize()} /></Row.Subtitle>
        <Row.RightContent>
          <Button class={btnClass} onClick={() => {
            getConfirmation(getClearStreamChunksArgs('250.1 MB'));
          }}>
            <I18nTsx key='StorageQuota.Clear' />
          </Button>
        </Row.RightContent>
      </Row>

      <Space amount='1rem' />

      <RangeSettingSelector
        minValue={1}
        maxValue={12}
        step={1}
        textLeft={<I18nTsx key='StorageQuota.ClearCacheOlderThan' />}
        textRight={(value) => '1 week'}
        value={4}
        onChange={() => {}}
      />

      <Space amount='1rem' />

      <Button primaryTransparent onClick={() => {
        getConfirmation(getClearAllArgs());
      }} icon='delete'>
        <I18nTsx key='StorageQuota.ClearAll' />
      </Button>
    </Section>
  );
};
