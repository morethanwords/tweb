import {createResource} from 'solid-js';
import renderImageFromUrl from '../../../../helpers/dom/renderImageFromUrl';
import {Photo} from '../../../../layer';
import choosePhotoSize from '../../../../lib/appManagers/utils/photos/choosePhotoSize';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';

type ChatPhotoProps = {
  photo: Photo.photo;
};

const photoSizePx = 120;

export const ChatPhoto = (props: ChatPhotoProps) => {
  const {rootScope} = useHotReloadGuard();

  const [img] = createResource(() => props.photo, async(photo) => {
    const img = document.createElement('img');

    const photoSize = choosePhotoSize(photo, photoSizePx);
    const url = await rootScope.managers.appPhotosManager.loadPhoto(photo, photoSize);

    await renderImageFromUrl(img, url);

    return img;
  });

  return (
    <div>
      {img()}
    </div>
  );
};
