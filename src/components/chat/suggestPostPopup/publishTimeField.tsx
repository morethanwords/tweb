import {formatFullSentTime} from '../../../helpers/date';
import {I18nTsx} from '../../../helpers/solid/i18n';
import {LangPackKey} from '../../../lib/langPack';
import {ButtonIconTsx} from '../../buttonIconTsx';
import {IconTsx} from '../../iconTsx';
import SimpleFormField from '../../simpleFormField';
import styles from './commonStyles.module.scss';
import PopupSchedulePost from './popupSchedulePost';


type Props = {
  value: number;
  onChange: (value: number | undefined) => void;
  noTimeLangKey: LangPackKey;
};

const PUBLISH_MIN_DELAY_MINUTES = 10;

const PublishTimeField = (props: Props) => {
  const onContainerClick = () => {
    const minTimeDate = new Date();
    minTimeDate.setMinutes(minTimeDate.getMinutes() + PUBLISH_MIN_DELAY_MINUTES);

    const minDate = new Date(minTimeDate);
    minDate.setHours(0, 0, 0, 0);

    new PopupSchedulePost({
      initDate: new Date(minTimeDate),
      minDate,
      minTimeDate,
      onPick: (timestamp) => {
        console.log(timestamp);
        props.onChange(timestamp);
      }
    }).show();
  };

  const onCrossClick = (event: MouseEvent) => {
    event.stopPropagation();
    props.onChange(undefined);
  };

  return (
    <SimpleFormField
      clickable
      withEndButtonIcon={!!props.value}
      onClick={onContainerClick}
    >
      <SimpleFormField.InputStub>
        {props.value ?
          <span>{formatFullSentTime(props.value)}</span> :
          <I18nTsx key={props.noTimeLangKey} />
        }
      </SimpleFormField.InputStub>
      <SimpleFormField.Label active>
        <I18nTsx key='SuggestedPosts.PublishingTime.Label' />
      </SimpleFormField.Label>
      <SimpleFormField.SideContent last>
        {props.value ?
          <ButtonIconTsx icon='cross' tabIndex={-1} onClick={onCrossClick} /> :
          <IconTsx class={styles.Icon} icon='down' />
        }
      </SimpleFormField.SideContent>
    </SimpleFormField>
  )
};

export default PublishTimeField;
