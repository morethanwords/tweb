import type SettingSection from '@components/settingSection';
import type {ChatAdministratorRights}
from '@components/sidebarRight/tabs/groupPermissions/sharedPermissions';
import type ListenerSetter from '@helpers/listenerSetter';
import {i18n} from '@lib/langPack';

export default function attachAdminRightsCaption(options: {
  section: SettingSection,
  permissions: ChatAdministratorRights,
  canEdit: boolean,
  listenerSetter: ListenerSetter
}) {
  const field = options.permissions.fields.find(
    (field) => field.flags[0] === 'add_admins'
  );
  const update = () => {
    options.section.caption.replaceChildren(i18n(
      options.canEdit ?
        (field.checkboxField.checked ?
          'Channel.Admin.AdminAccess' :
          'Channel.Admin.AdminRestricted') :
        'EditAdminCantEdit'
    ));
  };

  update();
  options.listenerSetter.add(field.checkboxField.input)('change', update);
}
