import Button from '@components/buttonTsx';
import RangeSettingSelector from '@components/rangeSettingSelector';
import Section from '@components/section';
import Space from '@components/space';
import {I18nTsx} from '@helpers/solid/i18n';
import type {FormatterArguments, LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import styles from './storageQuota.module.scss';


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

export const StorageQuota = () => {
  const {Row, confirmationPopup, i18n} = useHotReloadGuard();

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
        <Row.Subtitle>300 MB</Row.Subtitle>
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
        <Row.Subtitle>153.2 MB</Row.Subtitle>
      </Row>

      <Row>
        <Row.Icon icon='play' />
        <Row.Title><I18nTsx key='StorageQuota.VideoFiles' /></Row.Title>
        <Row.Subtitle>120.5 MB</Row.Subtitle>
      </Row>

      <Row>
        <Row.Icon icon='stickers_face' />
        <Row.Title><I18nTsx key='StorageQuota.StickersEmoji' /></Row.Title>
        <Row.Subtitle>5 MB</Row.Subtitle>
      </Row>

      <Row>
        <Row.Icon icon='limit_file' />
        <Row.Title><I18nTsx key='StorageQuota.Other' /></Row.Title>
        <Row.Subtitle>25 MB</Row.Subtitle>
      </Row>

      <Space amount='1rem' />

      <Row>
        <Row.Title><I18nTsx key='StorageQuota.CachedStreamChunks' /></Row.Title>
        <Row.Subtitle>250.1 MB</Row.Subtitle>
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
