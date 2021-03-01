import { SliderSuperTab } from "../../slider";
import { SettingSection } from "..";
import Button from "../../button";
import Row from "../../row";

export default class AppActiveSessionsTab extends SliderSuperTab {
  protected init() {
    this.container.classList.add('active-sessions-container');
    this.title.innerText = 'Active Sessions';

    const Session = (options: {
      application: string,
      device: string,
      ip: string,
      location: string,
      time?: string
    }) => {
      const row = new Row({
        title: options.application,
        subtitle: options.ip + ' - ' + options.location,
        clickable: true,
        titleRight: options.time
      });

      const midtitle = document.createElement('div');
      midtitle.classList.add('row-midtitle');
      midtitle.innerHTML = options.device;

      row.subtitle.parentElement.insertBefore(midtitle, row.subtitle);

      return row;
    };

    {
      const section = new SettingSection({
        name: 'Current Session'
      });

      const btnTerminate = Button('btn-primary btn-transparent danger', {icon: 'stop', text: 'Terminate all other sessions'});

      const session = Session({
        application: 'Telegram Web 1.0',
        device: 'Safari, macOS',
        ip: '216.3.128.12',
        location: 'Paris, France'
      });

      section.content.append(session.container, btnTerminate);
      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({
        name: 'Other Sessions'
      });

      [Session({
        application: 'Telegram iOS 5.12',
        device: 'iPhone X, iOS 13.2',
        ip: '216.3.128.12',
        location: 'Paris, France',
        time: '19:25'
      }), Session({
        application: 'Telegram Android 5.11',
        device: 'Samsung Galaxy S9, Android 9P',
        ip: '216.3.128.12',
        location: 'Paris, France',
        time: '16:34'
      })].forEach(session => {
        section.content.append(session.container);
      });

      this.scrollable.append(section.container);
    }
  }
}
