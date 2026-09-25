import ButtonIcon from '@components/buttonIcon';
import GeoPin from '@components/geoPin';
import InputField from '@components/inputField';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import ListenerSetter from '@helpers/listenerSetter';
import {onCleanup} from 'solid-js';
import type {ChatInputMapOptions} from '@components/chat/inputEditor/types';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getWebFileLocation from '@helpers/getWebFileLocation';
import {getMiddleware} from '@helpers/middleware';
import type {GeoPoint} from '@layer';
import I18n, {i18n} from '@lib/langPack';
import {
  composeRichMessageMapCaption,
  normalizeRichMessageMapCenter,
  panRichMessageMapCenter,
  splitRichMessageMapCaption
} from '@components/popups/richMessageLocationModel';

const DEFAULT_MAP_HEIGHT = 200;
const DEFAULT_MAP_WIDTH = 400;
const DEFAULT_PREVIEW_ZOOM = 13;
const MAX_ZOOM = 20;
const MIN_ZOOM = 1;

type RichMessageLocationPickerOptions = {
  editing?: boolean,
  map?: ChatInputMapOptions
};

class RichMessageLocationContent {
  public readonly body = document.createElement('div');
  private readonly listenerSetter = new ListenerSetter();
  private destroyed = false;
  private accuracyRadius: number;
  private addressInputField: InputField;
  private coordinates: HTMLElement;
  private latitude: number;
  private longitude: number;
  private mapHeight: number;
  private mapImage: HTMLElement;
  private mapPreview: HTMLElement;
  private mapWidth: number;
  private previewMiddleware = getMiddleware();
  private previewZoom: number;
  private titleInputField: InputField;

  constructor(private options: RichMessageLocationPickerOptions) {
    const map = options.map;
    this.latitude = map?.latitude ?? 20;
    this.longitude = map?.longitude ?? 0;
    this.previewZoom = map?.zoom ?? (map ? DEFAULT_PREVIEW_ZOOM : 2);
    this.mapWidth = map?.width ?? DEFAULT_MAP_WIDTH;
    this.mapHeight = map?.height ?? DEFAULT_MAP_HEIGHT;
    this.accuracyRadius = map?.accuracyRadius;

    const caption = splitRichMessageMapCaption(map?.caption);
    this.titleInputField = new InputField({
      label: 'Chat.Input.Editor.Map.CaptionTitle',
      plainText: true,
      withLinebreaks: false
    });
    this.addressInputField = new InputField({
      label: 'Chat.Input.Editor.Map.Address',
      plainText: true,
      withLinebreaks: false
    });
    if(caption.title) this.titleInputField.setValueSilently(caption.title);
    if(caption.address) this.addressInputField.setValueSilently(caption.address);

    const picker = document.createElement('div');
    picker.classList.add('popup-rich-map-picker');
    this.mapPreview = document.createElement('div');
    this.mapPreview.classList.add('popup-rich-map-preview');
    this.mapPreview.tabIndex = 0;
    this.mapPreview.style.aspectRatio = `${this.mapWidth} / ${this.mapHeight}`;
    this.mapPreview.setAttribute('role', 'application');
    this.mapPreview.setAttribute(
      'aria-label',
      I18n.format('Chat.Input.Editor.Map.Picker', true)
    );
    this.mapImage = document.createElement('div');
    this.mapImage.classList.add('popup-rich-map-image');
    const pin = GeoPin();
    pin.classList.add('popup-rich-map-pin');
    this.coordinates = document.createElement('div');
    this.coordinates.classList.add('popup-rich-map-coordinates');
    this.mapPreview.append(this.mapImage, pin, this.coordinates);

    const zoomControls = document.createElement('div');
    zoomControls.classList.add('popup-rich-map-zoom-controls');
    const zoomIn = ButtonIcon('zoomin', {noRipple: true});
    const zoomOut = ButtonIcon('zoomout', {noRipple: true});
    zoomIn.setAttribute('aria-label', I18n.format('KeyboardShortcuts.Action.ZoomIn', true));
    zoomOut.setAttribute('aria-label', I18n.format('KeyboardShortcuts.Action.ZoomOut', true));
    zoomControls.append(zoomIn, zoomOut);

    const currentLocation = document.createElement('button');
    currentLocation.classList.add(
      'btn-primary',
      'btn-color-primary',
      'popup-rich-map-current-location'
    );
    currentLocation.append(i18n('Chat.Input.Editor.Map.UseCurrentLocation'));

    const fields = document.createElement('div');
    fields.classList.add('popup-rich-map-fields');
    fields.append(
      this.titleInputField.container,
      this.addressInputField.container
    );
    picker.append(this.mapPreview, zoomControls, currentLocation, fields);
    this.body.prepend(picker);

    attachClickEvent(zoomIn, () => this.setZoom(this.previewZoom + 1), {
      listenerSetter: this.listenerSetter
    });
    attachClickEvent(zoomOut, () => this.setZoom(this.previewZoom - 1), {
      listenerSetter: this.listenerSetter
    });
    attachClickEvent(currentLocation, () => {
      if(!navigator.geolocation) return false;
      currentLocation.disabled = true;
      navigator.geolocation.getCurrentPosition((position) => {
        if(this.destroyed) return;
        this.accuracyRadius = Math.round(position.coords.accuracy);
        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.previewZoom = DEFAULT_PREVIEW_ZOOM;
        currentLocation.disabled = false;
        this.renderPreview();
      }, () => {
        if(this.destroyed) return;
        currentLocation.disabled = false;
      }, {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 10_000
      });
      return false;
    }, {listenerSetter: this.listenerSetter});
    currentLocation.hidden = !navigator.geolocation;

    this.setupMapInteraction();
    this.renderPreview();
  }

  public getMap(): ChatInputMapOptions {
    const map = this.options.map;
    const captionValue = composeRichMessageMapCaption(
      this.titleInputField.value,
      this.addressInputField.value
    );
    return {
      ...map,
      accuracyRadius: this.accuracyRadius,
      caption: captionValue,
      captionEntities: captionValue === map?.caption ? map.captionEntities : [],
      height: this.mapHeight,
      latitude: this.latitude,
      longitude: this.longitude,
      width: this.mapWidth,
      zoom: this.previewZoom
    };
  }

  private setZoom(zoom: number) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
    if(next === this.previewZoom) return false;
    this.previewZoom = next;
    this.renderPreview();
  }

  private setupMapInteraction() {
    let pointer: {
      id: number,
      x: number,
      y: number
    };
    this.listenerSetter.add(this.mapPreview)('pointerdown', (event) => {
      if(event.button !== 0) return;
      event.preventDefault();
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
      this.mapPreview.setPointerCapture(event.pointerId);
      this.mapPreview.classList.add('is-dragging');
    });
    this.listenerSetter.add(this.mapPreview)('pointermove', (event) => {
      if(!pointer || pointer.id !== event.pointerId) return;
      const x = event.clientX - pointer.x;
      const y = event.clientY - pointer.y;
      this.mapImage.style.transform = `translate(${x}px, ${y}px)`;
    });
    const finishPointer = (event: PointerEvent) => {
      if(!pointer || pointer.id !== event.pointerId) return;
      const dragX = event.clientX - pointer.x;
      const dragY = event.clientY - pointer.y;
      const dragged = Math.abs(dragX) + Math.abs(dragY) > 4;
      const rect = this.mapPreview.getBoundingClientRect();
      const deltaX = dragged ? -dragX : event.clientX - rect.left - rect.width / 2;
      const deltaY = dragged ? -dragY : event.clientY - rect.top - rect.height / 2;
      pointer = undefined;
      this.mapImage.style.transform = '';
      this.mapPreview.classList.remove('is-dragging');
      this.setCenter(panRichMessageMapCenter(
        {latitude: this.latitude, longitude: this.longitude},
        deltaX,
        deltaY,
        this.previewZoom
      ));
    };
    this.listenerSetter.add(this.mapPreview)('pointerup', finishPointer);
    this.listenerSetter.add(this.mapPreview)('pointercancel', (event) => {
      if(!pointer || pointer.id !== event.pointerId) return;
      pointer = undefined;
      this.mapImage.style.transform = '';
      this.mapPreview.classList.remove('is-dragging');
    });
    this.listenerSetter.add(this.mapPreview)('keydown', (event) => {
      const step = event.shiftKey ? 80 : 32;
      const delta = event.key === 'ArrowLeft' ? [-step, 0] :
        event.key === 'ArrowRight' ? [step, 0] :
        event.key === 'ArrowUp' ? [0, -step] :
        event.key === 'ArrowDown' ? [0, step] :
        undefined;
      if(delta) {
        event.preventDefault();
        this.setCenter(panRichMessageMapCenter(
          {latitude: this.latitude, longitude: this.longitude},
          delta[0],
          delta[1],
          this.previewZoom
        ));
      } else if(event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.setZoom(this.previewZoom + 1);
      } else if(event.key === '-') {
        event.preventDefault();
        this.setZoom(this.previewZoom - 1);
      }
    });
  }

  private setCenter(center: {latitude: number, longitude: number}) {
    const normalized = normalizeRichMessageMapCenter(center);
    this.accuracyRadius = undefined;
    this.latitude = normalized.latitude;
    this.longitude = normalized.longitude;
    this.renderPreview();
  }

  private renderPreview() {
    this.coordinates.textContent = [
      this.latitude.toFixed(6),
      this.longitude.toFixed(6),
      `z ${this.previewZoom}`
    ].join(', ');
    this.previewMiddleware.clean();
    this.mapImage.replaceChildren();
    const image = document.createElement('div');
    image.classList.add('popup-rich-map-photo');
    this.mapImage.append(image);
    const geo: GeoPoint.geoPoint = {
      _: 'geoPoint',
      access_hash: 0,
      lat: this.latitude,
      long: this.longitude
    };
    const middleware = this.previewMiddleware.get();
    const location = getWebFileLocation(
      geo,
      this.mapWidth,
      this.mapHeight,
      this.previewZoom
    );
    void import('@components/wrappers/photo').then(({default: wrapPhoto}) => {
      if(!middleware()) return;
      return wrapPhoto({
        boxHeight: this.mapHeight,
        boxWidth: this.mapWidth,
        container: image,
        lazyLoadQueue: false,
        middleware,
        photo: location,
        withoutPreloader: true
      });
    }).catch(() => {});
  }

  public destroy() {
    this.destroyed = true;
    this.listenerSetter.removeAll();
    this.previewMiddleware.destroy();
  }
}

export default function showRichMessageLocationPicker(
  options: RichMessageLocationPickerOptions = {}
): Promise<ChatInputMapOptions> {
  return new Promise((resolve, reject) => {
    let settled = false;
    createPopup(() => {
      const content = new RichMessageLocationContent(options);
      onCleanup(() => content.destroy());
      return (
        <PopupElement class="popup-rich-map" closable onClose={() => {
          content.destroy();
          if(!settled) reject();
        }}>
          <PopupElement.Header>
            <PopupElement.CloseButton />
            <PopupElement.Title>{i18n(options.editing ? 'Chat.Input.Editor.Map.EditTitle' : 'Chat.Input.Editor.Map.Title')}</PopupElement.Title>
          </PopupElement.Header>
          <PopupElement.Body>{content.body}</PopupElement.Body>
          <PopupElement.Footer>
            <PopupElement.FooterButton confirm langKey={options.editing ? 'Save' : 'Create'} callback={() => {
              settled = true;
              resolve(content.getMap());
            }} />
          </PopupElement.Footer>
        </PopupElement>
      );
    });
  });
}
