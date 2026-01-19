import {batch, createEffect, createMemo, createSignal, JSX, on, onCleanup, onMount} from 'solid-js';
import {doubleRaf} from '@helpers/schedulers';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import AdjustmentsTab from '@components/mediaEditor/tabs/adjustmentsTab';
import BrushTab from '@components/mediaEditor/tabs/brushTab';
import CropTab from '@components/mediaEditor/tabs/cropTab';
import StickersTab from '@components/mediaEditor/tabs/stickersTab';
import TabContent from '@components/mediaEditor/tabs/tabContent';
import Tabs from '@components/mediaEditor/tabs/tabs';
import TextTab from '@components/mediaEditor/tabs/textTab';
import Topbar from '@components/mediaEditor/topbar';
import useIsMobile from '@components/mediaEditor/useIsMobile';
import {delay} from '@components/mediaEditor/utils';
import {animateValue} from '@helpers/animateValue';
import {lerp} from '@helpers/lerp';


export default function Toolbar(props: {onFinish: () => void; onClose: () => void}) {
  let toolbar: HTMLDivElement;

  const {editorState, actions} = useMediaEditorContext();

  const [move, setMove] = createSignal(0);
  const [isCollapsed, setIsCollapsed] = createSignal(false);
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const [containerHeight, setContainerHeight] = createSignal(0);
  const [extraMove, setExtraMove] = createSignal(0);

  const isMobile = useIsMobile();

  const [shouldHide, setShouldHide] = createSignal(isMobile());

  let startY = 0;
  let isAborted = true;
  let isResetting = false;
  let canMove = false;

  function resetMove() {
    if(isResetting) return;
    isResetting = true;

    startY = 0;
    isAborted = true;
    animateValue(move(), 0, 200, setMove);
    setTimeout(() => {
      isResetting = false;
    }, 200);
  }
  actions.abortDrawerSlide = () => resetMove();

  onMount(() => {
    function startDrag(y: number) {
      if(!isMobile()) return;
      startY = y;
      isAborted = false;
      canMove = false;
      setTimeout(() => {
        canMove = true;
      }, 100); // wait for scroll to trigger first
    }
    function dragMove(y: number) {
      if(!isMobile()) return;
      if(isAborted) return;
      if(!canMove) return;
      const diff = y - startY;
      if(isCollapsed()) setMove(Math.min(Math.max(-containerHeight(), diff), 0));
      else setMove(Math.max(Math.min(containerHeight(), diff), 0));
    }
    function dragEnd() {
      if(!isMobile()) return;
      if(isAborted) return;
      isAborted = true;
      if(Math.abs(move()) > 100) {
        setIsCollapsed((prev) => !prev);
      } else {
        resetMove();
      }
    }

    container().addEventListener('input', () => {
      resetMove();
    });

    toolbar.addEventListener('touchstart', (e) => {
      startDrag(e.touches[0].clientY);
    });
    toolbar.addEventListener('touchmove', (e) => {
      dragMove(e.touches[0].clientY);
    });
    toolbar.addEventListener('touchend', (e) => {
      dragEnd();
    });
    toolbar.addEventListener('mousedown', (e) => {
      startDrag(e.clientY);
    });
    toolbar.addEventListener('mousemove', (e) => {
      dragMove(e.clientY);
    });
    toolbar.addEventListener('mouseup', (e) => {
      dragEnd();
    });
    toolbar.addEventListener('mouseout', (e) => {
      dragEnd();
    });
  });

  createEffect(() => {
    const observer = new ResizeObserver(() => {
      setContainerHeight(container()?.clientHeight || 0);
    });
    observer.observe(container());
    onCleanup(() => observer.disconnect());
  });

  createEffect(
    on(isCollapsed, () => {
      const initialMove = move();
      const initialExtraMove = extraMove();
      const targetExtraMove = isCollapsed() ? containerHeight() : 0;
      animateValue(0, 1, 200, (progress) => {
        batch(() => {
          setMove(lerp(initialMove, 0, progress));
          setExtraMove(lerp(initialExtraMove, targetExtraMove, progress));
        });
      });
    })
  );

  createEffect(() => {
    if(editorState.currentTab !== 'crop') setIsCollapsed(false);
  });

  createEffect(() => {
    if(editorState.renderingPayload && shouldHide()) {
      (async() => {
        toolbar.style.transition = '.2s';
        await doubleRaf();
        setShouldHide(false);
        await delay(200);
        toolbar.style.removeProperty('transition');
      })();
    }
  });

  const totalMove = () => extraMove() + move();

  const style = createMemo((): JSX.CSSProperties => {
    if(isMobile()) return {
      'opacity': editorState.isAdjusting ? 0 : 1,
      'transform': shouldHide() ?
        'translate(-50%, 100%)' :
        `translate(-50%, ${totalMove()}px)`
    };
  });

  return (
    <div
      ref={toolbar}
      class="media-editor__toolbar"
      style={style()}
    >
      <div class="media-editor__toolbar-draggable" />
      <Topbar onClose={() => props.onClose()} onFinish={props.onFinish} />
      <Tabs />
      <TabContent
        onContainer={setContainer}
        onScroll={() => {
          resetMove();
        }}
        tabs={{
          adjustments: () => <AdjustmentsTab />,
          crop: () => <CropTab />,
          text: () => <TextTab />,
          brush: () => <BrushTab />,
          stickers: () => <StickersTab />
        }}
      />
    </div>
  );
}
