import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';

export default function showLogOutPopup() {
  confirmationPopup({
    titleLangKey: 'LogOut',
    descriptionLangKey: 'LogOut.Description',
    button: {
      langKey: 'LogOut',
      isDanger: true
    }
  }).then(() => {
    rootScope.managers.apiManager.logOut();
  });
}
