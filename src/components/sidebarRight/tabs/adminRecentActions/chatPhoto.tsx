import {Photo} from '../../../../layer';
import {PhotoTsx} from '../../../wrappers/photo';
import styles from './chatPhoto.module.scss';


type ChatPhotoProps = {
  photo: Photo.photo;
  rounded?: boolean;
  isForum?: boolean;
};

const boxSize = 120;

export const ChatPhoto = (props: ChatPhotoProps) => {
  return (
    <div class={styles.Container} classList={{
      [styles.forum]: props.isForum,
      [styles.rounded]: props.rounded
    }}>
      <PhotoTsx class={styles.Photo} photo={props.photo} boxWidth={boxSize} boxHeight={boxSize} withoutPreloader />
    </div>
  );
};
