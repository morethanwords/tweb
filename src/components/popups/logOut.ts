import rootScope from '../../lib/rootScope';
import confirmationPopup from '../confirmationPopup';

export default function showLogOutPopup() {
  confirmationPopup({
    titleLangKey: 'LogOut',
    descriptionLangKey: 'LogOut.Description',
    button: {
      langKey: 'LogOut',
      callback: () => {
        rootScope.managers.apiManager.logOut();
      },
      isDanger: true
    }
  });
}
