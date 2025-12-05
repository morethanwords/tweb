import {i18n} from '../../../../lib/langPack';
import {KeyValuePair} from './keyValuePair';

export const BooleanKeyValue = (props: { value: boolean }) => (
  <KeyValuePair
    label={i18n('AdminRecentActions.ChangedTo')}
    value={props.value ?
      i18n('AdminRecentActions.Enabled') :
      i18n('AdminRecentActions.Disabled')
    }
  />
);
