import {AppDialogsManager} from '@lib/appDialogsManager';
import {i18n, LangPackKey} from '@lib/langPack';
import Section from '@components/section';
import {createMemo, createRoot, createSignal, JSX, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {Middleware} from '@helpers/middleware';
import Scrollable from '@components/scrollable2';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {CROSS_FADE_KEYFRAMES, getAnimatedOptions} from '@helpers/dom/crossfadeContent';
import liteMode from '@helpers/liteMode';
import deferredPromise from '@helpers/cancellablePromise';

export type SearchGroupType = 'contacts' | 'globalContacts' | 'messages' | string;

export type SearchGroup = ReturnType<typeof createSearchGroup>;

/**
 * What a group is given for a query while the previous one's results stay on screen: its rows go to a
 * list of their own, out of the document, and take the shown ones' place in one go (`commitSearchGroups`)
 */
type SearchGroupDraft = {
  list: HTMLElement,
  active: boolean,
  placeholder?: HTMLElement,
  showMoreClassName?: string,
  /** adds to what the group shows instead of replacing it - the part of a query that came after it was shown */
  merge?: boolean
};

/** One group's part of a commit, run phase by phase for all of them: every read before any write */
type SearchGroupCommit = {
  measure: () => void,
  apply: () => void,
  measureApplied: () => void,
  play: () => void,
  /** what it showed is off screen */
  finished: Promise<void>
};

/**
 * How long a group takes to go from one query's results to the next one's: a fade and the height it
 * follows, quicker with reduced animations, where a fade stands alone
 */
export function getSearchTransitionDuration() {
  return liteMode.getAnimationLevel() === 2 ? 250 : 180;
}

/** Ends the rows a group showed, the dialog elements' own parts with them */
export function destroySearchRows(rows: Element[]) {
  rows.forEach((row) => {
    const dialogElement = (row as any).dialogElement;
    if(dialogElement) dialogElement.remove();
    else row.remove();
  });
}

/**
 * Puts what the groups were given aside (`startDraft`) in place of what they show. Done for all of
 * them at once, so the reads of every group come before the writes of any: one layout for the lot.
 * Animated, a group that comes grows in (`fadeOnly`: fades in, when nothing was shown before), one that
 * goes shrinks away, and one that stays crossfades its rows while its height follows them
 */
export function commitSearchGroups(groups: SearchGroup[], options: {animate: boolean, fadeOnly?: boolean}) {
  const commits = groups.map((group) => group.commitDraft(options)).filter(Boolean);
  commits.forEach((commit) => commit.measure());
  commits.forEach((commit) => commit.apply());
  commits.forEach((commit) => commit.measureApplied());
  commits.forEach((commit) => commit.play());
  return Promise.all(commits.map((commit) => commit.finished)).then(() => {});
}

export function createSearchGroup(options: {
  name?: LangPackKey | boolean,
  type: string,
  clearable?: boolean,
  className?: string,
  clickable?: boolean,
  autonomous?: boolean,
  onFound?: Parameters<AppDialogsManager['setListClickListener']>[0]['onFound'],
  noIcons?: boolean,
  middleware?: Middleware,
  scrollableX?: boolean
}) {
  const {
    name,
    type,
    clearable = true,
    className,
    clickable = true,
    autonomous = true,
    onFound,
    noIcons,
    middleware,
    scrollableX
  } = options;

  const NameRight = (props: {
    children: JSX.Element,
    onClick?: () => void
  }) => {
    return (
      <span
        class="cursor-pointer hover-underline"
        onClick={props.onClick}
      >
        {props.children}
      </span>
    );
  };

  const [hide, setHide] = createSignal(true);
  const [showingMore, setShowingMore] = createSignal(false);
  const [showMoreClassName, setShowMoreClassName] = createSignal<string>();
  const [_nameRight, setNameRight] = createSignal<Parameters<typeof NameRight>[0]>();
  const nameRight = createMemo(() => {
    const _ = _nameRight();
    if(_) {
      return NameRight(_);
    }

    const toggleClassName = showMoreClassName();
    if(!toggleClassName) {
      return;
    }

    return (
      <NameRight
        onClick={() => {
          setShowingMore((v) => !v);
        }}
      >
        {i18n(showingMore() ? 'Separator.ShowLess' : 'Separator.ShowMore')}
      </NameRight>
    );
  });
  const list = hotReloadGuard.appDialogsManager.createChatList();
  let container: HTMLDivElement;
  let nameEl: HTMLDivElement;
  let placeholder: HTMLElement;
  let draft: SearchGroupDraft;
  // * ends the transition of the last commit at once, leaving what it was going to
  let finishTransition: () => void;

  createRoot((dispose) => {
    <Section
      name={name}
      nameRef={(ref) => nameEl = ref}
      nameRight={nameRight()}
      class={classNames(
        'search-group',
        'search-group-' + type,
        className,
        hide() && 'hide',
        showMoreClassName() && !showingMore() && showMoreClassName(),
        scrollableX && 'search-group-with-scroll'
      )}
      ref={(ref) => container = ref}
      innerClass="search-group-inner"
      contentProps={{
        class: 'search-group-content'
      }}
    >
      <Show when={scrollableX} fallback={list}>
        <Scrollable
          class="search-group-scrollable-x"
          axis="x"
        >
          {list}
        </Scrollable>
      </Show>
    </Section>;

    middleware?.onClean(dispose);
  });

  if(clickable) {
    hotReloadGuard.appDialogsManager.setListClickListener({
      list,
      onFound,
      withContext: undefined,
      autonomous
    });
  }

  const setShowMore = (toggleClassName: string) => {
    if(showMoreClassName() !== toggleClassName) {
      setShowingMore(false);
    }

    setShowMoreClassName(toggleClassName);
  };

  const discardDraft = () => {
    if(!draft) {
      return;
    }

    destroySearchRows(Array.from(draft.list.children));
    draft = undefined;
  };

  const commitDraft = ({animate, fadeOnly}: {animate: boolean, fadeOnly?: boolean}): SearchGroupCommit => {
    const _draft = draft;
    if(!_draft) {
      return;
    }

    draft = undefined;
    finishTransition?.();

    const {merge} = _draft;
    const wasShown = !hide();
    const willShow = merge ? wasShown || _draft.active : _draft.active;
    const oldRows = merge ? [] : Array.from(list.children);
    const newRows = Array.from(_draft.list.children);
    const hasRows = newRows.length || (merge && list.childElementCount);
    const oldPlaceholder = placeholder;
    let newPlaceholder = merge ? (hasRows ? undefined : _draft.placeholder || oldPlaceholder) : _draft.placeholder;
    // * the same notice for this query: it stays as it is, its animation not played again
    if(isSamePlaceholder(oldPlaceholder, newPlaceholder)) {
      newPlaceholder = oldPlaceholder;
    }

    const leavingPlaceholder = oldPlaceholder !== newPlaceholder ? oldPlaceholder : undefined;

    const applyRows = () => {
      if(merge) {
        // * a sponsored row is put first, as it is rendered
        list.prepend(...newRows.filter((row) => (row as HTMLElement).dataset.sponsored));
        list.append(...newRows.filter((row) => !(row as HTMLElement).dataset.sponsored));
      } else {
        list.append(...newRows);
      }
    };

    const applyRest = () => {
      if(newPlaceholder && newPlaceholder !== oldPlaceholder) {
        container.append(newPlaceholder);
      }

      placeholder = newPlaceholder;
      // * what is added can bring a "show more" in, never take it away
      if(!merge || _draft.showMoreClassName) {
        setShowMore(_draft.showMoreClassName);
      }

      setHide(!willShow);
    };

    // * no transition: the new state at once
    if(!animate || !container.isConnected || (!wasShown && !willShow)) {
      return {
        measure: () => {},
        apply: () => {
          destroySearchRows(oldRows);
          leavingPlaceholder?.remove();
          applyRows();
          applyRest();
        },
        measureApplied: () => {},
        play: () => {},
        finished: Promise.resolve()
      };
    }

    const animations: Animation[] = [];
    const finished = deferredPromise<void>();
    const options = getAnimatedOptions(getSearchTransitionDuration());
    let fromHeight: number, toHeight: number, padding: number;
    let listRect: {top: number, left: number, width: number, height: number};
    let placeholderTop: number;
    let leavingRows: HTMLElement;

    const cleanupStyles = () => {
      container.style.removeProperty('overflow');
      if(leavingPlaceholder) {
        leavingPlaceholder.remove();
        leavingPlaceholder.style.removeProperty('position');
        leavingPlaceholder.style.removeProperty('top');
        leavingPlaceholder.style.removeProperty('inset-inline');
      }

      if(leavingRows) {
        destroySearchRows(Array.from(leavingRows.children));
        leavingRows.remove();
        leavingRows = undefined;
      }
    };

    const finish = finishTransition = () => {
      finishTransition = undefined;
      animations.forEach((animation) => animation.cancel());
      animations.length = 0;
      if(!willShow) {
        // * it shrank away showing what it had: what it has now goes in hidden
        destroySearchRows(oldRows);
        applyRows();
        applyRest();
      }

      cleanupStyles();
      finished.resolve();
    };

    const lastAnimation = () => animations[animations.length - 1];
    const onFinished = () => {
      const animation = lastAnimation();
      animation?.finished.then(() => {
        if(finishTransition === finish) {
          finish();
        }
      }, () => {});
    };

    // * comes: grows in (or fades in, with nothing shown around it before)
    if(!wasShown) {
      return {
        measure: () => {
          padding = getVerticalPadding(container);
        },
        apply: () => {
          destroySearchRows(oldRows);
          applyRows();
          applyRest();
        },
        measureApplied: () => {
          toHeight = container.offsetHeight;
        },
        play: () => {
          container.style.overflow = 'hidden';
          animations.push(container.animate(fadeOnly ? CROSS_FADE_KEYFRAMES : growFromNothingKeyframes(toHeight, padding), options));
          onFinished();
        },
        finished
      };
    }

    // * goes: shrinks away with what it showed, what it has now goes in when it is gone
    if(!willShow) {
      return {
        measure: () => {
          padding = getVerticalPadding(container);
          fromHeight = container.offsetHeight;
        },
        apply: () => {},
        measureApplied: () => {},
        play: () => {
          container.style.overflow = 'hidden';
          animations.push(container.animate(growFromNothingKeyframes(fromHeight, padding).reverse(), {...options, fill: 'forwards'}));
          onFinished();
        },
        finished
      };
    }

    // * stays: the rows crossfade where they stand, the height following them
    return {
      measure: () => {
        fromHeight = container.offsetHeight;
        if(oldRows.length) {
          const parentRect = list.parentElement.getBoundingClientRect();
          const rect = list.getBoundingClientRect();
          listRect = {
            top: rect.top - parentRect.top,
            left: rect.left - parentRect.left,
            width: rect.width,
            height: rect.height
          };
        }

        if(leavingPlaceholder) {
          placeholderTop = leavingPlaceholder.getBoundingClientRect().top - container.getBoundingClientRect().top;
        }
      },
      apply: () => {
        if(oldRows.length) {
          // * the old rows leave over the new ones, in a list of their own kind for the same look
          leavingRows = list.cloneNode(false) as HTMLElement;
          leavingRows.removeAttribute('id');
          leavingRows.classList.add('search-group-leaving');
          leavingRows.setAttribute('aria-hidden', 'true');
          // * nor in the tab order: rows of a query that is over
          leavingRows.inert = true;
          // * measured, so physical
          leavingRows.style.top = listRect.top + 'px';
          leavingRows.style.left = listRect.left + 'px';
          leavingRows.style.width = listRect.width + 'px';
          leavingRows.style.height = listRect.height + 'px';
          leavingRows.append(...oldRows);
          list.after(leavingRows);
        }

        if(leavingPlaceholder) {
          // * not moved: a custom element taken out of the document starts over
          leavingPlaceholder.style.position = 'absolute';
          leavingPlaceholder.style.top = placeholderTop + 'px';
          leavingPlaceholder.style.insetInline = '0';
        }

        applyRows();
        applyRest();
      },
      measureApplied: () => {
        toHeight = container.offsetHeight;
      },
      play: () => {
        container.style.overflow = 'hidden';
        const fadeOut = CROSS_FADE_KEYFRAMES.slice().reverse();
        if(Math.abs(toHeight - fromHeight) > .5) {
          animations.push(container.animate([{height: fromHeight + 'px'}, {height: toHeight + 'px'}], options));
        }

        if(leavingRows) {
          animations.push(leavingRows.animate(fadeOut, {...options, fill: 'forwards'}));
        }

        if(leavingPlaceholder) {
          animations.push(leavingPlaceholder.animate(fadeOut, {...options, fill: 'forwards'}));
        }

        if(merge) {
          newRows.forEach((row) => animations.push(row.animate(CROSS_FADE_KEYFRAMES, options)));
        } else if(newRows.length) {
          animations.push(list.animate(CROSS_FADE_KEYFRAMES, options));
        }

        if(newPlaceholder && newPlaceholder !== oldPlaceholder) {
          animations.push(newPlaceholder.animate(CROSS_FADE_KEYFRAMES, options));
        }

        if(animations.length) {
          onFinished();
        } else {
          finish();
        }
      },
      finished
    };
  };

  const group = {
    container,
    /** where the rows go: the draft's list while there is one */
    get list() {
      return draft ? draft.list : list;
    },
    nameEl,
    autonomous,
    noIcons,
    createPlaceholder: undefined as () => HTMLElement,
    get placeholder() {
      return draft ? draft.placeholder : placeholder;
    },
    get isDrafting() {
      return !!draft;
    },
    /** what is on screen, a draft aside */
    get isShown() {
      return !hide();
    },
    /** whether it is to be on screen once its draft is committed */
    get willShow() {
      if(!draft) {
        return !hide();
      }

      return draft.merge ? !hide() || draft.active : draft.active;
    },
    /**
     * A look-alike of the group as it is shown, holding its rows - moved, not copied - to be laid over
     * the tab while it crossfades as a whole. Its notice goes too, unless the draft's is the same one
     * and stays (`commitDraft`). A custom element of the title (a menu) is left out: one made again
     * would start over
     */
    ghost() {
      finishTransition?.();
      const keepPlaceholder = isSamePlaceholder(placeholder, draft?.placeholder);
      const ghostOf = (element: Element): HTMLElement => {
        if(element === list) {
          const clone = element.cloneNode(false) as HTMLElement;
          clone.append(...Array.from(element.childNodes));
          return clone;
        }

        if(!element.contains(list)) {
          const clone = element.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('*').forEach((child) => {
            if(child.tagName.includes('-')) child.remove();
          });
          return clone;
        }

        const clone = element.cloneNode(false) as HTMLElement;
        Array.from(element.children).forEach((child) => {
          if(child !== placeholder) {
            clone.append(ghostOf(child));
          }
        });
        return clone;
      };

      const clone = ghostOf(container);
      clone.removeAttribute('id');
      if(placeholder && !keepPlaceholder) {
        clone.append(placeholder);
        placeholder = undefined;
      }

      return clone;
    },
    addPlaceholder(el: HTMLElement) {
      group.removePlaceholder();
      if(draft) {
        draft.placeholder = el;
        return;
      }

      placeholder = el;
      container.append(el);
    },
    removePlaceholder() {
      if(draft) {
        draft.placeholder = undefined;
        return;
      }

      placeholder?.remove();
      placeholder = undefined;
    },
    clear() {
      if(draft) {
        destroySearchRows(Array.from(draft.list.children));
        draft.active = false;
        draft.placeholder = undefined;
        return;
      }

      finishTransition?.();
      setHide(true);
      group.removePlaceholder();
      if(clearable) {
        destroySearchRows(Array.from(list.children));
      }
    },
    setActive() {
      if(draft) {
        draft.active = true;
        return;
      }

      setHide(false);
    },
    toggle() {
      if(group.list.childElementCount) {
        group.setActive();
      } else if(draft?.merge) {
        // * what the group already shows stays
      } else {
        group.clear();
      }
    },
    needShowMoreButton(toggleClassName = 'is-short-5') {
      if(draft) {
        draft.showMoreClassName = toggleClassName;
        return;
      }

      setShowMoreClassName(toggleClassName);
    },
    /**
     * From now on the group gets the rows of a new query aside, out of the document, while it goes on
     * showing what it has until `commitSearchGroups` - from scratch, or to add them to what it shows
     * (`merge`). A draft under way is dropped
     */
    startDraft(merge?: boolean) {
      discardDraft();
      const draftList = list.cloneNode(false) as HTMLElement;
      draftList.removeAttribute('id');
      draft = {
        list: draftList,
        active: false,
        merge
      };
    },
    discardDraft,
    commitDraft,
    setNameRight
  };

  return group;
}

/** Two notices of nothing found that say the same (`dataset.key`): the one on screen stays for the other */
function isSamePlaceholder(shown: HTMLElement, next: HTMLElement) {
  return !!shown && !!next && shown !== next && !!next.dataset.key && next.dataset.key === shown.dataset.key;
}

/** The padding the box of `element` cannot shrink past, which a negative margin takes back while it grows */
function getVerticalPadding(element: HTMLElement) {
  const style = getComputedStyle(element);
  return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
}

/** From nothing to `height`: the margin takes back the padding a box of no height still has */
function growFromNothingKeyframes(height: number, padding: number): Keyframe[] {
  return [
    {height: '0px', marginBottom: -padding + 'px', opacity: 0},
    {height: height + 'px', marginBottom: '0px', opacity: 1}
  ];
}
