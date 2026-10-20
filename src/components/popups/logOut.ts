import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export default function showLogOutPopup() {
  const managers = bindManagersToSession(rootScope.managers);
  confirmationPopup({
    titleLangKey: 'LogOut',
    descriptionLangKey: 'LogOut.Description',
    button: {
      langKey: 'LogOut',
      isDanger: true
    }
  }).then(() => {
    managers.apiManager.logOut();
  });
}
