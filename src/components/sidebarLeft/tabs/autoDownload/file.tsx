import formatBytes from '@helpers/formatBytes';
import debounce from '@helpers/schedulers/debounce';
import I18n, {LangPackKey, _i18n} from '@lib/langPack';
import {useAppSettings} from '@stores/appSettings';
import RangeSelector from '@components/rangeSelector';
import autoDownloadTab from './autoDownloadTab';
import {autoDownloadPeerTypeSection} from './peerTypeSection';

class RangeSettingSelector {
  public container: HTMLDivElement;
  public valueContainer: HTMLElement;
  private range: RangeSelector;

  public onChange: (value: number) => void;

  constructor(
    name: LangPackKey,
    step: number,
    initialValue: number,
    minValue: number,
    maxValue: number,
    writeValue = true
  ) {
    const BASE_CLASS = 'range-setting-selector';
    this.container = document.createElement('div');
    this.container.classList.add(BASE_CLASS);

    const details = document.createElement('div');
    details.classList.add(BASE_CLASS + '-details');

    const nameDiv = document.createElement('div');
    nameDiv.classList.add(BASE_CLASS + '-name');
    _i18n(nameDiv, name);

    const valueDiv = this.valueContainer = document.createElement('div');
    valueDiv.classList.add(BASE_CLASS + '-value');

    if(writeValue) {
      valueDiv.innerHTML = '' + initialValue;
    }

    details.append(nameDiv, valueDiv);

    this.range = new RangeSelector({
      step,
      min: minValue,
      max: maxValue
    }, initialValue);
    this.range.setListeners();
    this.range.setHandlers({
      onScrub: (value) => {
        this.onChange?.(value);

        if(writeValue) {
          valueDiv.innerText = '' + value;
        }
      }
    });

    this.container.append(details, this.range.container);
  }
}

export default autoDownloadTab((tab) => {
  const [appSettings, setAppSettings] = useAppSettings();

  const debouncedSave = debounce((sizeMax: number) => {
    setAppSettings('autoDownloadNew', 'file_size_max', sizeMax);
  }, 200, false, true);

  const section = autoDownloadPeerTypeSection('file', 'AutoDownloadFilesTitle', tab.listenerSetter);

  const MIN = 512 * 1024;
  // const MAX = 2 * 1024 * 1024 * 1024;
  const MAX = 20 * 1024 * 1024;
  const MAX_RANGE = MAX - MIN;

  const sizeMax = appSettings.autoDownloadNew.file_size_max;
  const value = Math.sqrt(Math.sqrt((sizeMax - MIN) / MAX_RANGE));
  const upTo = new I18n.IntlElement({
    key: 'AutodownloadSizeLimitUpTo',
    args: [formatBytes(sizeMax)]
  });
  const range = new RangeSettingSelector('AutoDownloadMaxFileSize', 0.01, value, 0, 1, false);
  range.onChange = (value) => {
    const sizeMax = (value ** 4 * MAX_RANGE + MIN) | 0;

    upTo.compareAndUpdate({args: [formatBytes(sizeMax)]});

    debouncedSave(sizeMax);
  };

  range.valueContainer.append(upTo.element);

  section.content.append(range.container);

  tab.scrollable.append(section.container);
});
