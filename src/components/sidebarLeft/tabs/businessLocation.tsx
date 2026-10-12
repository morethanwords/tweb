import {createMemo, createResource, createSignal, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import type CheckboxField from '@components/checkboxField';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import confirmationPopup from '@components/confirmationPopup';
import {InputFieldTsx} from '@components/inputFieldTsx';
import MediaHeader from '@components/mediaHeader';
import Row from '@components/rowTsx';
import SaveButton from '@components/saveButton';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import wrapPhoto from '@components/wrappers/photo';
import type {AppBusinessLocationTab} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import getWebFileLocation from '@helpers/getWebFileLocation';
import confirmOpenGoogleMaps from '@components/confirmOpenGoogleMaps';
import A11yButton from '@components/a11yButton';
import createMiddleware from '@helpers/solid/createMiddleware';
import {GrowHeightReveal} from '@helpers/solid/animations';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {BusinessLocation, GeoPoint, UserFull} from '@layer';
import {i18n} from '@lib/langPack';
import type {PreloadedLottieAsset} from '@lib/lottie/lottieLoader';

import styles from '@components/sidebarLeft/tabs/businessLocation.module.scss';

type AppBusinessLocationTabType = typeof AppBusinessLocationTab;

export type BusinessLocationTabPayload = {
  animationData: PreloadedLottieAsset,
  userFull: MaybePromise<UserFull.userFull>
};

const MAX_ADDRESS_LENGTH = 96;
const MAP_WIDTH = 320;
const MAP_HEIGHT = 160;
const MAP_ZOOM = 15;

const BusinessLocationTab = () => {
  const [tab] = useSuperTab<AppBusinessLocationTabType>();
  const promiseCollector = usePromiseCollector();

  const loadPromise = Promise.resolve(tab.payload.userFull).then((userFull) => ({
    location: userFull?.business_location as BusinessLocation.businessLocation
  }));
  promiseCollector.collect(loadPromise);

  const [data] = createResource(() => loadPromise);

  // Outside the form, which waits for the data: rendered now, the sticker is one
  // of the things the tab waits for before it slides in.
  return (
    <>
      <MediaHeader marginBottom>
        <MediaHeader.Sticker animationData={tab.payload.animationData} size={130} restartOnClick={false} />
        <MediaHeader.Title>{i18n('BusinessLocation')}</MediaHeader.Title>
        <MediaHeader.Subtitle>{i18n('BusinessLocationInfo')}</MediaHeader.Subtitle>
      </MediaHeader>
      <Show when={data()}>
        <BusinessLocationForm location={data().location} />
      </Show>
    </>
  );
};

export default BusinessLocationTab;

const BusinessLocationForm = (props: {
  location: BusinessLocation.businessLocation
}) => {
  const [tab] = useSuperTab<AppBusinessLocationTabType>();

  const savedAddress = props.location?.address || '';
  const savedGeoPoint = props.location?.geo_point?._ === 'geoPoint' ?
    props.location.geo_point :
    undefined;

  const [address, setAddress] = createSignal(savedAddress);
  const [geoPoint, setGeoPoint] = createSignal<GeoPoint.geoPoint>(savedGeoPoint);
  const [saving, setSaving] = createSignal(false);

  const trimmedAddress = () => address().trim();
  const isEmpty = () => !trimmedAddress() && !geoPoint();
  const isTooLong = () => trimmedAddress().length > MAX_ADDRESS_LENGTH;

  const hasChanges = createMemo(() => (
    trimmedAddress() !== savedAddress.trim() || geoPoint() !== savedGeoPoint
  ));

  const canSave = createMemo(() => hasChanges() && !isTooLong() && (isEmpty() || !!trimmedAddress()));

  /**
   * Resolves to whether the location was saved. The header button closes the tab
   * once it is; the "unsaved changes" popup does not, since the slider is already
   * closing the tab — closing it here as well would close the tab beneath it too.
   */
  const save = async(close: boolean) => {
    if(saving()) return false;
    setSaving(true);

    try {
      await tab.managers.appBusinessManager.updateBusinessLocation(
        isEmpty() ? undefined : {address: trimmedAddress(), geoPoint: geoPoint()}
      );
      tab.isConfirmationNeededOnClose = undefined;
      if(close) tab.close();
      return true;
    } catch(err) {
      console.error('updateBusinessLocation error:', err);
      toastNew({langPackKey: 'Error.AnError'});
      return false;
    } finally {
      setSaving(false);
    }
  };

  const clear = async() => {
    try {
      await confirmationPopup({
        titleLangKey: 'BusinessLocationClear',
        descriptionLangKey: 'BusinessLocationClearMessage',
        button: {langKey: 'Remove', isDanger: true}
      });
    } catch(err) {
      return;
    }

    setSaving(true);
    try {
      await tab.managers.appBusinessManager.updateBusinessLocation();
      tab.isConfirmationNeededOnClose = undefined;
      tab.close();
    } catch(err) {
      console.error('updateBusinessLocation error:', err);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setSaving(false);
    }
  };

  // The map picker needs a full map UI that the web client doesn't ship; an existing
  // point (set from a mobile client) can still be shown, opened and dropped here.
  // Turning it ON is refused, so the toggle has to be put back by hand — `checked`
  // stays false and would not re-render the control on its own.
  let mapCheckboxField: CheckboxField;
  const toggleMap = (value: boolean) => {
    if(value) {
      mapCheckboxField.setValueSilently(false);
      toastNew({langPackKey: 'BusinessLocationMapUnsupported'});
      return;
    }

    setGeoPoint(undefined);
  };

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    hasChanges: canSave,
    // a failed save keeps the tab open, changes and all
    saveAllSettings: async() => {
      if(!await save(false)) throw new Error('BUSINESS_LOCATION_NOT_SAVED');
    },
    descriptionLangKey: 'UnsavedChangesDescription.BusinessLocation',
    waitForSave: true
  });

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={canSave() && !saving()} onClick={() => save(true)} />
      </Portal>

      <Section>
        <div class="input-wrapper">
          <InputFieldTsx
            label="BusinessLocationAddress"
            name="business-address"
            maxLength={MAX_ADDRESS_LENGTH}
            value={address()}
            onRawInput={setAddress}
          />
        </div>
      </Section>

      <Section>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              checked={!!geoPoint()}
              toggle
              onChange={toggleMap}
              ref={(checkboxField) => mapCheckboxField = checkboxField}
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('BusinessLocationMap')}</Row.Title>
        </Row>
        <GrowHeightReveal when={geoPoint()} appear={false}>
          <Show keyed when={geoPoint()}>{(geo) => (
            // a press asks before leaving for Google Maps, as a profile's location does
            <A11yButton
              class={styles.mapPreview}
              aria-label={i18n('Map').textContent}
              onClick={() => confirmOpenGoogleMaps(geo)}
              ref={(container) => {
                wrapPhoto({
                  photo: getWebFileLocation(geo, MAP_WIDTH, MAP_HEIGHT, MAP_ZOOM),
                  container,
                  middleware: createMiddleware().get(),
                  boxWidth: MAP_WIDTH,
                  boxHeight: MAP_HEIGHT
                });
              }}
            />
          )}</Show>
        </GrowHeightReveal>
      </Section>

      <Show when={props.location}>
        <Section>
          <Row color="danger" clickable={clear}>
            <Row.Icon icon="delete" />
            <Row.Title class="danger">{i18n('BusinessLocationClear')}</Row.Title>
          </Row>
        </Section>
      </Show>
    </>
  );
};
