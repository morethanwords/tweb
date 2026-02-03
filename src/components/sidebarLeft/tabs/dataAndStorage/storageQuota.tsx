import Button from '@components/buttonTsx';
import RangeSettingSelector from '@components/rangeSettingSelector';
import Section from '@components/section';
import Space from '@components/space';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import DEBUG from '@config/debug';
import lastItem from '@helpers/array/lastItem';
import formatBytes from '@helpers/formatBytes';
import {DurationType} from '@helpers/formatDuration';
import namedPromises from '@helpers/namedPromises';
import {I18nTsx} from '@helpers/solid/i18n';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {cachedFilesStorageName, cachedVideoChunksStorageNames, HTTPHeaderNames, oneDayInSeconds, oneMonthInSeconds, oneWeekInSeconds, oneYearInSeconds, watchedCachedStorageNames} from '@lib/constants';
import CacheStorageController from '@lib/files/cacheStorage';
import type {FormatterArgument, FormatterArguments, LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createResource, createSignal, JSX, Match, Resource, Switch} from 'solid-js';
import styles from './storageQuota.module.scss';


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

const tryFormatBytes = (size: number | null | undefined) => {
  if(typeof size !== 'number') return null;
  return formatBytes(size, decimalsForFormatBytes);
}

type CollectedCategory = 'images' | 'videos' | 'stickers' | 'other';

async function collectCachedFilesSizes() {
  const collectedSizeByTypes: Record<CollectedCategory, number> = {
    images: 0,
    videos: 0,
    stickers: 0,
    other: 0
  };
  let totalSize = 0;

  const storage = new CacheStorageController(cachedFilesStorageName);

  await storage.minimalBlockingIterateResponses(({response}) => {
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

async function collectCachedVideoStreamChunksSize() {
  let totalSize = 0;

  for(const storageName of cachedVideoChunksStorageNames) {
    const storage = new CacheStorageController(storageName);

    await storage.minimalBlockingIterateResponses(({response}) => {
      const contentSize = getContentSizeFromHeaders(response.headers);
      totalSize += contentSize;
    }).finally(() => {
      storage.forget();
    });
  }

  return totalSize;
}

function getContentSizeFromHeaders(headers: Headers): number {
  const contentSize = parseInt(headers.get(HTTPHeaderNames.contentLength) || '0');
  if(!contentSize) return 0;

  return contentSize;
}

const SizeWithFallback = (props: {
  resource: Resource<unknown>;
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


const makeTimeOption = (value: number, duration: number, type: DurationType) => ({
  value,
  label: () => wrapFormattedDuration([{duration, type}])
});

const cacheTimeOptions = [
  makeTimeOption(oneDayInSeconds, 1, DurationType.Days),
  makeTimeOption(oneDayInSeconds * 2, 2, DurationType.Days),
  makeTimeOption(oneDayInSeconds * 3, 3, DurationType.Days),
  makeTimeOption(oneDayInSeconds * 4, 4, DurationType.Days),
  makeTimeOption(oneDayInSeconds * 5, 5, DurationType.Days),
  makeTimeOption(oneDayInSeconds * 6, 6, DurationType.Days),
  makeTimeOption(oneWeekInSeconds, 1, DurationType.Weeks),
  makeTimeOption(oneWeekInSeconds * 2, 2, DurationType.Weeks),
  makeTimeOption(oneWeekInSeconds * 3, 3, DurationType.Weeks),
  makeTimeOption(oneMonthInSeconds, 1, DurationType.Months),
  makeTimeOption(oneMonthInSeconds * 2, 2, DurationType.Months),
  makeTimeOption(oneMonthInSeconds * 3, 3, DurationType.Months),
  makeTimeOption(oneMonthInSeconds * 4, 4, DurationType.Months),
  makeTimeOption(oneMonthInSeconds * 5, 5, DurationType.Months),
  makeTimeOption(oneMonthInSeconds * 6, 6, DurationType.Months),
  makeTimeOption(oneYearInSeconds, 1, DurationType.Years)
];

const makeSizeOption = (value: number) => ({
  value,
  label: () => formatBytes(value, decimalsForFormatBytes)
});

const mb = 1024 * 1024;
const gb = mb * 1024;

type Option = {
  value: number;
  label: () => JSX.Element;
};

const haveSmallSize = false && DEBUG;

const getCacheSizeOptions = (autoLabel: () => JSX.Element) => [
  ...(haveSmallSize ? [makeSizeOption(10 * mb)] : []),
  makeSizeOption(100 * mb),
  makeSizeOption(200 * mb),
  makeSizeOption(300 * mb),
  makeSizeOption(400 * mb),
  makeSizeOption(500 * mb),
  makeSizeOption(600 * mb),
  makeSizeOption(700 * mb),
  makeSizeOption(800 * mb),
  makeSizeOption(900 * mb),
  makeSizeOption(1 * gb),
  makeSizeOption(2 * gb),
  makeSizeOption(3 * gb),
  makeSizeOption(4 * gb),
  makeSizeOption(5 * gb),
  makeSizeOption(6 * gb),
  makeSizeOption(7 * gb),
  makeSizeOption(8 * gb),
  makeSizeOption(9 * gb),
  makeSizeOption(10 * gb),
  {
    value: 0,
    label: autoLabel
  }
];

const getInitialCacheTimeIdx = (cacheTTL: number) => {
  const value = cacheTTL || 0;
  let foundIdx = 0;
  for(let i = 1; i < cacheTimeOptions.length; i++) {
    if(cacheTimeOptions[i].value <= value) foundIdx = i;
  }
  return foundIdx;
};

const getInitialCacheSizeIdx = (cacheSize: number, options: Option[]) => {
  const value = cacheSize || 0;
  if(value === 0) return options.length - 1;

  let foundIdx = 0;
  for(let i = 1; i < options.length - 1; i++) {
    if(options[i].value <= value) foundIdx = i;
  }
  return foundIdx;
};

export type StorageQuotaControls = {
  save: () => Promise<void>;
};

type Props = {
  controlsRef: (controls: StorageQuotaControls) => void;
};

export const StorageQuota = (props: Props) => {
  const {Row, confirmationPopup, i18n, useAppSettings, apiManagerProxy} = useHotReloadGuard();

  const cacheSizeOptions = getCacheSizeOptions(() => i18n('StorageQuota.CacheSizeLimitAuto'));

  const [appSettings, setAppSettings] = useAppSettings();

  const [cachedFilesSizes, cachedFilesSizesActions] = createResource(collectCachedFilesSizes);
  const [cachedVideoStreamChunksSize, cachedVideoStreamChunksSizeActions] = createResource(collectCachedVideoStreamChunksSize);

  const [cacheTimeIdx, setCacheTimeIdx] = createSignal<number>(getInitialCacheTimeIdx(appSettings.cacheTTL));
  const [cacheSizeIdx, setCacheSizeIdx] = createSignal<number>(getInitialCacheSizeIdx(appSettings.cacheSize, cacheSizeOptions));

  const getFinalCacheTTL = () => {
    const option = cacheTimeOptions[cacheTimeIdx()] || cacheTimeOptions[0];
    if(option.value === appSettings.cacheTTL) return;

    return option.value;
  };

  const getFinalCacheSize = () => {
    const option = cacheSizeOptions[cacheSizeIdx()] || lastItem(cacheSizeOptions);
    if(option.value === appSettings.cacheSize) return;

    return option.value;
  };

  props.controlsRef({
    save: async() => {
      const cacheTTL = getFinalCacheTTL();
      const cacheSize = getFinalCacheSize();

      await Promise.all([
        cacheTTL !== undefined ? setAppSettings('cacheTTL', cacheTTL) : Promise.resolve(),
        cacheSize !== undefined ? setAppSettings('cacheSize', cacheSize) : Promise.resolve()
      ]);
    }
  });

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
    const formattedSize = tryFormatBytes(cachedFilesSizes.state === 'ready' ? cachedFilesSizes()?.totalSize : null);
    if(!(await getConfirmation(getClearCachedFilesArgs(formattedSize)))) return;

    cachedFilesSizesActions.mutate(getZeroedCollectedCachedFilesSizes());

    await apiManagerProxy.clearCacheStoragesByNames([cachedFilesStorageName]);

    // Note: refetch triggers 'Loading...' to reappear, we don't want that
    const newValue = await collectCachedFilesSizes();
    cachedFilesSizesActions.mutate(newValue);
  });

  const onClearCachedVideoStreamChunks = wrapAsyncClickHandler(async() => {
    const formattedSize = tryFormatBytes(cachedVideoStreamChunksSize.state === 'ready' ? cachedVideoStreamChunksSize() : null);
    if(!(await getConfirmation(getClearStreamChunksArgs(formattedSize)))) return;

    cachedVideoStreamChunksSizeActions.mutate(0);

    await apiManagerProxy.clearCacheStoragesByNames(cachedVideoChunksStorageNames);

    const newValue = await collectCachedVideoStreamChunksSize();
    cachedVideoStreamChunksSizeActions.mutate(newValue);
  });

  const onClearAllCachedData = wrapAsyncClickHandler(async() => {
    if(!(await getConfirmation(getClearAllArgs()))) return;

    cachedFilesSizesActions.mutate(getZeroedCollectedCachedFilesSizes());
    cachedVideoStreamChunksSizeActions.mutate(0);

    await apiManagerProxy.clearCacheStoragesByNames(watchedCachedStorageNames);

    const {newCachedFilesSizes, newCachedVideoStreamChunksSize} = await namedPromises({
      newCachedFilesSizes: collectCachedFilesSizes(),
      newCachedVideoStreamChunksSize: collectCachedVideoStreamChunksSize()
    });

    cachedFilesSizesActions.mutate(newCachedFilesSizes);
    cachedVideoStreamChunksSizeActions.mutate(newCachedVideoStreamChunksSize);
  });

  return (
    <Section name='StorageQuota.Title' caption='StorageQuota.Caption'>
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
        minValue={0}
        maxValue={cacheTimeOptions.length - 1}
        step={1}
        textLeft={<I18nTsx key='StorageQuota.ClearCacheOlderThan' />}
        textRight={(idx) => cacheTimeOptions[idx]?.label()}
        value={cacheTimeIdx()}
        onChange={setCacheTimeIdx}
      />

      <Space amount='0.5rem' />

      <RangeSettingSelector
        minValue={0}
        maxValue={cacheSizeOptions.length - 1}
        step={1}
        textLeft={<I18nTsx key='StorageQuota.CacheSizeLimit' />}
        textRight={(idx) => cacheSizeOptions[idx]?.label()}
        value={cacheSizeIdx()}
        onChange={setCacheSizeIdx}
      />

      <Space amount='1rem' />

      <Button primaryTransparent onClick={onClearAllCachedData} icon='delete'>
        <I18nTsx key='StorageQuota.ClearAll' />
      </Button>
    </Section>
  );
};
