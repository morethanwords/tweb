import Button from '@components/buttonTsx';
import RangeSettingSelector from '@components/rangeSettingSelector';
import Section from '@components/section';
import Space from '@components/space';
import {I18nTsx} from '@helpers/solid/i18n';
import type {FormatterArgument, FormatterArguments, LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import styles from './storageQuota.module.scss';
import CacheStorageController, {CacheStorageDbName} from '@lib/files/cacheStorage';
import {createResource, Match, Resource, Switch} from 'solid-js';
import formatBytes from '@helpers/formatBytes';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import namedPromises from '@helpers/namedPromises';


const decimalsForFormatBytes = 1;

type ConfirmationArgs = {
  titleLangKey: LangPackKey;
  descriptionLangKey: LangPackKey;
  descriptionLangArgs?: FormatterArguments;
};

const getClearCachedFilesArgs = (size: FormatterArgument | null): ConfirmationArgs => ({
  titleLangKey: 'StorageQuota.ClearCachedFiles',
  descriptionLangKey: size ? 'StorageQuota.ClearConfirmation' : 'StorageQuota.ClearConfirmationUnknown',
  descriptionLangArgs: size ? [size] : undefined
});

const getClearStreamChunksArgs = (size: FormatterArgument | null): ConfirmationArgs => ({
  titleLangKey: 'StorageQuota.ClearCachedStreamChunks',
  descriptionLangKey: size ? 'StorageQuota.ClearConfirmation' : 'StorageQuota.ClearConfirmationUnknown',
  descriptionLangArgs: size ? [size] : undefined
});

const getClearAllArgs = (): ConfirmationArgs => ({
  titleLangKey: 'StorageQuota.ClearAll',
  descriptionLangKey: 'StorageQuota.ClearAllConfirmation'
});

const tryFormatBytes = (size: number | undefined) => {
  if(typeof size !== 'number') return null;
  return formatBytes(size, decimalsForFormatBytes);
}

type CollectedCategory = 'images' | 'videos' | 'stickers' | 'other';

const cachedFilesStorageName = 'cachedFiles' satisfies CacheStorageDbName;

async function collectCachedFilesSizes() {
  const collectedSizeByTypes: Record<CollectedCategory, number> = {
    images: 0,
    videos: 0,
    stickers: 0,
    other: 0
  };
  let totalSize = 0;

  const storage = new CacheStorageController(cachedFilesStorageName);

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

function getZeroedCollectedCachedFilesSizes(): Awaited<ReturnType<typeof collectCachedFilesSizes>> {
  return {
    totalSize: 0,
    collectedSizeByTypes: {
      images: 0,
      videos: 0,
      stickers: 0,
      other: 0
    }
  };
}

const cachedVideoChunksStorageNames: CacheStorageDbName[] = [
  'cachedStreamChunks',
  'cachedHlsStreamChunks',
  'cachedHlsQualityFiles'
];

async function collectCachedVideoStreamChunksSize() {
  let totalSize = 0;

  for(const storageName of cachedVideoChunksStorageNames) {
    const storage = new CacheStorageController(storageName);

    await storage.minimalBlockingIterateResponses((response) => {
      const contentSize = getContentSizeFromHeaders(response.headers);
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

function useCacheStorageThreadedControls() {
  const {apiManagerProxy} = useHotReloadGuard();

  return {
    disableCacheStoragesOnAllThreads: async(names: CacheStorageDbName[]) => {
      CacheStorageController.temporarilyToggleByNames(names, false);
      await Promise.all([
        apiManagerProxy.invoke('disableCacheStoragesByNames', names),
        apiManagerProxy.serviceMessagePort.invoke('disableCacheStoragesByNames', names)
      ]);
    },
    enableCacheStoragesOnAllThreads: async(names: CacheStorageDbName[]) => {
      CacheStorageController.temporarilyToggleByNames(names, true);
      await Promise.all([
        apiManagerProxy.invoke('enableCacheStoragesByNames', names),
        apiManagerProxy.serviceMessagePort.invoke('enableCacheStoragesByNames', names)
      ]);
    },
    resetCacheStoragesOnAllThreads: async(names: CacheStorageDbName[]) => {
      CacheStorageController.resetOpenStoragesByNames(names);
      await Promise.all([
        apiManagerProxy.invoke('resetOpenCacheStoragesByNames', names),
        apiManagerProxy.serviceMessagePort.invoke('resetOpenCacheStoragesByNames', names)
      ]);
    }
  };
}

function useClearStoragesByNames() {
  const {
    enableCacheStoragesOnAllThreads,
    disableCacheStoragesOnAllThreads,
    resetCacheStoragesOnAllThreads
  } = useCacheStorageThreadedControls();


  return async(names: CacheStorageDbName[]) => {
    await disableCacheStoragesOnAllThreads(names);

    await CacheStorageController.clearEncryptableStoragesByNames(names);

    await resetCacheStoragesOnAllThreads(names);
    await enableCacheStoragesOnAllThreads(names);
  };
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
      {formatBytes(props.value, decimalsForFormatBytes)}
    </Match>
    <Match when>
      <I18nTsx key='StorageQuota.FailedToCalculate' />
    </Match>
  </Switch>
);

export const StorageQuota = () => {
  const {Row, confirmationPopup, i18n} = useHotReloadGuard();

  const clearStoragesByNames = useClearStoragesByNames();

  const [cachedFilesSizes, cachedFilesSizesActions] = createResource(() => collectCachedFilesSizes());
  const [cachedVideoStreamChunksSize, cachedVideoStreamChunksSizeActions] = createResource(() => collectCachedVideoStreamChunksSize());

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

  const onClearCachedFiles = wrapAsyncClickHandler(async() => {
    const formattedSize = tryFormatBytes(cachedFilesSizes()?.totalSize);
    if(!(await getConfirmation(getClearCachedFilesArgs(formattedSize)))) return;

    cachedFilesSizesActions.mutate(getZeroedCollectedCachedFilesSizes());

    await clearStoragesByNames([cachedFilesStorageName]);

    // Note: refetch triggers 'Loading...' to reappear, we don't want that
    const newValue = await collectCachedFilesSizes();
    cachedFilesSizesActions.mutate(newValue);
  });

  const onClearCachedVideoStreamChunks = wrapAsyncClickHandler(async() => {
    const formattedSize = tryFormatBytes(cachedVideoStreamChunksSize());
    if(!(await getConfirmation(getClearStreamChunksArgs(formattedSize)))) return;

    cachedVideoStreamChunksSizeActions.mutate(0);

    await clearStoragesByNames(cachedVideoChunksStorageNames);

    const newValue = await collectCachedVideoStreamChunksSize();
    cachedVideoStreamChunksSizeActions.mutate(newValue);
  });

  const onClearAllCachedData = wrapAsyncClickHandler(async() => {
    if(!(await getConfirmation(getClearAllArgs()))) return;

    cachedFilesSizesActions.mutate(getZeroedCollectedCachedFilesSizes());
    cachedVideoStreamChunksSizeActions.mutate(0);

    await clearStoragesByNames([cachedFilesStorageName, ...cachedVideoChunksStorageNames]);

    const {newCachedFilesSizes, newCachedVideoStreamChunksSize} = await namedPromises({
      newCachedFilesSizes: collectCachedFilesSizes(),
      newCachedVideoStreamChunksSize: collectCachedVideoStreamChunksSize()
    });

    cachedFilesSizesActions.mutate(newCachedFilesSizes);
    cachedVideoStreamChunksSizeActions.mutate(newCachedVideoStreamChunksSize);
  });

  return (
    <Section name='StorageQuota.Title'>
      <Row>
        <Row.Title><I18nTsx key='StorageQuota.CachedFiles' /></Row.Title>
        <Row.Subtitle><SizeWithFallback resource={cachedFilesSizes} value={cachedFilesSizes()?.totalSize} /></Row.Subtitle>
        <Row.RightContent>
          <div>
            <Button class={btnClass} onClick={onClearCachedFiles}>
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
          <Button class={btnClass} onClick={onClearCachedVideoStreamChunks}>
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

      <Button primaryTransparent onClick={onClearAllCachedData} icon='delete'>
        <I18nTsx key='StorageQuota.ClearAll' />
      </Button>
    </Section>
  );
};
