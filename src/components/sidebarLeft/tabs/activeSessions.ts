import { SliderSuperTab } from "../../slider";
import { SettingSection } from "..";
import Button from "../../button";
import Row from "../../row";
import { Authorization } from "../../../layer";
import { formatDateAccordingToToday } from "../../../helpers/date";
import { attachContextMenuListener, openBtnMenu, positionMenu } from "../../misc";
import { attachClickEvent, findUpClassName, toggleDisability } from "../../../helpers/dom";
import ButtonMenu from "../../buttonMenu";
import PopupConfirmAction from "../../popups/confirmAction";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import { toast } from "../../toast";

export default class AppActiveSessionsTab extends SliderSuperTab {
  public authorizations: Authorization.authorization[];
  private menuElement: HTMLElement;
  
  protected init() {
    this.container.classList.add('active-sessions-container');
    this.title.innerText = 'Active Sessions';

    const Session = (auth: Authorization.authorization) => {
      const row = new Row({
        title: [auth.app_name, auth.app_version].join(' '),
        subtitle: [auth.ip, auth.country].join(' - '),
        clickable: true,
        titleRight: auth.pFlags.current ? undefined : formatDateAccordingToToday(new Date(Math.max(auth.date_active, auth.date_created) * 1000))
      });

      row.container.dataset.hash = auth.hash;

      const midtitle = document.createElement('div');
      midtitle.classList.add('row-midtitle');
      midtitle.innerHTML = [auth.device_model, auth.system_version].join(', ');

      row.subtitle.parentElement.insertBefore(midtitle, row.subtitle);

      return row;
    };

    const authorizations = this.authorizations.slice();

    {
      const section = new SettingSection({
        name: 'Current Session'
      });

      const auth = authorizations.findAndSplice(auth => auth.pFlags.current);
      const session = Session(auth);

      section.content.append(session.container);

      if(authorizations.length) {
        const btnTerminate = Button('btn-primary btn-transparent danger', {icon: 'stop', text: 'Terminate all other sessions'});
        attachClickEvent(btnTerminate, (e) => {
          new PopupConfirmAction('revoke-session', [{
            text: 'TERMINATE',
            isDanger: true,
            callback: () => {
              toggleDisability([btnTerminate], true);
              apiManager.invokeApi('auth.resetAuthorizations').then(value => {
                //toggleDisability([btnTerminate], false);
                btnTerminate.remove();
                otherSection.container.remove();
              });
            }
          }], {
            title: 'Terminate All Other Sessions',
            text: 'Are you sure you want to terminate all other sessions?'
          }).show();
        });
  
        section.content.append(btnTerminate);
      }

      this.scrollable.append(section.container);
    }

    if(!authorizations.length) {
      return;
    }

    const otherSection = new SettingSection({
      name: 'Other Sessions'
    });

    authorizations.forEach(auth => {
      otherSection.content.append(Session(auth).container);
    });

    this.scrollable.append(otherSection.container);

    let target: HTMLElement;
    const onTerminateClick = () => {
      const hash = target.dataset.hash;
      
      new PopupConfirmAction('revoke-session', [{
        text: 'TERMINATE',
        isDanger: true,
        callback: () => {
          apiManager.invokeApi('account.resetAuthorization', {hash})
          .then(value => {
            if(value) {
              target.remove();
            }
          }, (err) => {
            if(err.type === 'FRESH_RESET_AUTHORISATION_FORBIDDEN') {
              toast('For security reasons, you can\'t terminate older sessions from a device that you\'ve just connected. Please use an earlier connection or wait for a few hours.');
            }
          });
        }
      }], {
        title: 'Terminate Session',
        text: 'Do you want to terminate this session?'
      }).show();
    };

    const element = this.menuElement = ButtonMenu([{
      icon: 'stop',
      text: 'Terminate',
      onClick: onTerminateClick
    }]);
    element.id = 'active-sessions-contextmenu';
    element.classList.add('contextmenu');

    document.getElementById('page-chats').append(element);

    attachContextMenuListener(this.scrollable.container, (e) => {
      target = findUpClassName(e.target, 'row');
      if(!target || target.dataset.hash === '0') {
        return;
      }

      if(e instanceof MouseEvent) e.preventDefault();
      // smth
      if(e instanceof MouseEvent) e.cancelBubble = true;

      positionMenu(e, element);
      openBtnMenu(element);
    });

    attachClickEvent(this.scrollable.container, (e) => {
      target = findUpClassName(e.target, 'row');
      if(!target || target.dataset.hash === '0') {
        return;
      }

      onTerminateClick();
    });
  }

  onCloseAfterTimeout() {
    if(this.menuElement) {
      this.menuElement.remove();
    }

    return super.onCloseAfterTimeout();
  }
}
