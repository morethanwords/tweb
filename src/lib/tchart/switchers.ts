import TDrag from './drag';
import {isTouchDevice} from './utils';
import {TChartUnitOptions} from './types';

export default class TSwitchers {
  private opts: TChartUnitOptions;
  private timeout: NodeJS.Timeout | undefined;
  private preventClick = false;
  private isTouch: boolean;
  private enabled: number;
  public switchers: HTMLDivElement[];
  private isDarkMode: boolean;
  private drag: TDrag;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;
    this.isTouch = isTouchDevice();
    this.enabled = opts.data.ys.length;

    if(this.enabled === 1 && !opts.data.forceLegend) {
      opts.$parent.style.display = 'none';
    }

    this.switchers = opts.data.ys.map((item, ind, arr) => {
      const $div = document.createElement('div');
      $div.className = 'tchart--switcher';

      if(ind === 0) {
        $div.classList.add('tchart--switcher__first');
      } else if(ind === (arr.length - 1)) {
        $div.classList.add('tchart--switcher__last');
      }

      if(opts.state[`e_${ind}`]) {
        $div.classList.toggle('tchart--switcher__active');
      } else {
        this.enabled--;
      }

      $div.setAttribute('data-label', item.label);
      opts.$parent.appendChild($div);

      const $span = document.createElement('span');
      $span.className = 'tchart--switcher-text';
      $span.textContent = item.label;
      $div.appendChild($span);

      if(!this.isTouch) {
        $div.addEventListener('mouseenter', () => {
          if(opts.state[`e_${ind}`]) {
            opts.additional.onEnter(ind);
          }
        });

        $div.addEventListener('mouseleave', () => {
          if(opts.state[`e_${ind}`]) {
            opts.additional.onLeave(ind);
          }
        });
      }

      $div.addEventListener('click', (e) => {
        if(this.preventClick) {
          this.preventClick = false;
          return;
        }

        const isActive = $div.classList.contains('tchart--switcher__active');

        if(isActive && this.enabled === 1) {
          $div.classList.add('tchart--switcher__denied');

          clearTimeout(this.timeout!);
          this.timeout = setTimeout(() => {
            $div.classList.remove('tchart--switcher__denied');
          }, 500);
          return;
        }

        if(!this.isTouch) {
          isActive ? opts.additional.onLeave(ind) : opts.additional.onEnter(ind);
        }

        opts.additional.onClick(!isActive, ind);
      });

      let dx: number, dy: number;
      let longTapTimer: NodeJS.Timeout;

      this.drag = new TDrag({
        $el: $div,
        noPrevent: true,
        useElForMove: true,
        onDragStart: (params) => {
          dx = params.pageX;
          dy = params.pageY;

          longTapTimer = setTimeout(() => {
            this.preventClick = true;
            if(!this.isTouch) {
              opts.additional.onEnter(ind);
            }
            opts.additional.onLongTap(ind);
          }, 500);
        },
        onDragMove: (params) => {
          if(Math.abs(dx - params.pageX) > 5 || Math.abs(dy - params.pageY) > 5) {
            clearTimeout(longTapTimer);
          }
        },
        onDragEnd: (params) => {
          clearTimeout(longTapTimer);
        }
      });

      return $div;
    });

    this.updateColors();
  }

  onResize() {}

  updateColors() {
    const ys = this.opts.data.ys;
    for(let i = 0; i < this.switchers.length; i++) {
      this.switchers[i].style.color = this.isDarkMode ? ys[i].colors_n[1] : ys[i].colors_d[1];
    }
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
    this.updateColors();
  }

  render(o: boolean[]) {
    this.enabled = 0;

    for(let i = 0; i < this.switchers.length; i++) {
      if(o[i]) {
        this.enabled++;
        this.switchers[i].classList.add('tchart--switcher__active');
      } else {
        this.switchers[i].classList.remove('tchart--switcher__active');
      }
    }
  }
}
