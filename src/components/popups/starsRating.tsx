
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {StarsRating, User, UserFull} from '@layer';
import {i18n} from '@lib/langPack';
import bigInt from 'big-integer';
import {LimitLineTsx} from '@components/limitLineTsx';
import {I18nTsx} from '@helpers/solid/i18n';
import Row from '@components/rowTsx';
import classNames from '@helpers/string/classNames';
import styles from '@components/popups/starsRating.module.scss';
import {createMemo, createSignal, Show, Switch} from 'solid-js';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {Transition} from 'solid-transition-group';
import {IconTsx} from '@components/iconTsx';
import formatNumber from '@helpers/number/formatNumber';

function Badge(props: {
  active: boolean
}) {
  return (
    <I18nTsx
      key={props.active ? 'StarsRating.BadgeAdded' : 'StarsRating.BadgeDeducted'}
      class={classNames(styles.badge, props.active && styles.active)}
    />
  );
}

export default function showStarsRatingPopup(props: {
  user: User.user
  userFull: UserFull.userFull
}) {
  const {
    stars_rating: currentRating,
    stars_my_pending_rating: futureRating,
    stars_my_pending_rating_date: futureRatingDate
  } = props.userFull;

  const isPersonal = props.user.id === rootScope.myId;
  const pendingStars = Number(futureRating?.stars ?? 0) - Number(currentRating.stars);

  const [isFuture, setIsFuture] = createSignal(false);
  const rating = () => isFuture() ? futureRating : currentRating;
  const isNegativeLevel = () => rating().level < 0;

  createPopup(() => {
    const progress = createMemo(() => {
      const rating$ = rating();
      const isMaxLevel = rating$.next_level_stars === undefined;
      const isNegativeLevel = rating$.level < 0;
      if(isNegativeLevel) {
        return 0.5;
      } else if(isMaxLevel) {
        return 1;
      } else {
        return (Number(rating$.stars) - Number(rating$.current_level_stars)) /
          (Number(rating$.next_level_stars) - Number(rating$.current_level_stars));
      }
    });

    return (
      <PopupElement class={styles.popup} containerClass={styles.popupContainer}>
        <PopupElement.Header class={styles.popupHeader}>
          <PopupElement.CloseButton class={styles.popupCloseButton} />
        </PopupElement.Header>
        <PopupElement.Body>
          <LimitLineTsx
            class={classNames(styles.limitLine, isNegativeLevel() && styles.limitLineNegative)}
            progress={progress()}
            progressFrom={isNegativeLevel() ? i18n('StarsRating.Negative') : i18n('StarsRating.Level', [rating().level])}
            progressTo={isNegativeLevel() ? <div /> : i18n('StarsRating.Level', [rating().level + 1])}
            reverse={isNegativeLevel()}
            hint={isNegativeLevel() && !isPersonal ? undefined : (
              <div class={styles.hint}>
                {formatNumber(Number(rating().stars))}
                {rating().next_level_stars && !isNegativeLevel() && (
                  <span class={styles.nextLevelStars}>
                    {' '}
                    / {formatNumber(Number(rating().next_level_stars))}
                  </span>
                )}
              </div>
            )}
            hintIcon={isNegativeLevel() ? 'warning' : 'crownalt'}
            hintJustIcon={true}
          />

          <Show when={isNegativeLevel() && !futureRating}>
            <I18nTsx
              key={isPersonal ? 'StarsRating.NegativeDescriptionMy' : 'StarsRating.NegativeDescription'}
              class={classNames(styles.description, styles.negativeDescription)}
              args={isPersonal ?
                [Math.abs(Number(rating().stars)).toString()] :
                [wrapEmojiText(props.user.first_name)]
              }
            />
          </Show>

          <Show when={futureRating}>
            <div class={styles.description}>
              <Transition mode="outin">
                <Show when={!isFuture()}>
                  <div class={styles.descriptionInner}>
                    <I18nTsx
                      key="StarsRating.PendingDescription"
                      args={[
                        wrapFormattedDuration(formatDuration(futureRatingDate - Date.now() / 1000, 1)),
                        pendingStars.toString()
                      ]}
                    />
                    <a class={styles.previewButton} onClick={() => setIsFuture(true)}>
                      <I18nTsx key="StarsRating.Preview" />
                      <IconTsx icon="next" />
                    </a>
                  </div>
                </Show>
                <Show when={isFuture()}>
                  <div class={styles.descriptionInner}>
                    <I18nTsx
                      key="StarsRating.FutureDescription"
                      args={[
                        wrapFormattedDuration(formatDuration(futureRatingDate - Date.now() / 1000, 1)),
                        pendingStars.toString()
                      ]}
                    />
                    <a class={styles.previewButton} onClick={() => setIsFuture(false)}>
                      <I18nTsx key="StarsRating.Back" />
                      <IconTsx icon="next" />
                    </a>
                  </div>
                </Show>
              </Transition>
            </div>
          </Show>

          <I18nTsx key="StarsRating.Title" class={styles.title} />
          <I18nTsx
            key={isPersonal ? 'StarsRating.SubtitleMy' : 'StarsRating.Subtitle'}
            class={styles.subtitle}
            args={[wrapEmojiText(props.user.first_name)]}
          />

          <div class={styles.list}>
            <Row class={styles.row}>
              <Row.Icon class={styles.rowIcon} icon="gift" />
              <Row.Title class="text-bold">
                <I18nTsx key="StarsRating.Row1Title" />
              </Row.Title>
              <Row.Subtitle class={styles.rowSubtitle}>
                <Badge active={true} />
                <I18nTsx key="StarsRating.Row1Subtitle" />
              </Row.Subtitle>
            </Row>

            <Row class={styles.row}>
              <Row.Icon class={styles.rowIcon} icon="group_star" />
              <Row.Title class="text-bold">
                <I18nTsx key="StarsRating.Row2Title" />
              </Row.Title>
              <Row.Subtitle class={styles.rowSubtitle}>
                <Badge active={true} />
                <I18nTsx key="StarsRating.Row2Subtitle" />
              </Row.Subtitle>
            </Row>

            <Row class={styles.row}>
              <Row.Icon class={styles.rowIcon} icon="reload_star" />
              <Row.Title class="text-bold">
                <I18nTsx key="StarsRating.Row3Title" />
              </Row.Title>
              <Row.Subtitle class={styles.rowSubtitle}>
                <Badge active={false} />
                <I18nTsx key="StarsRating.Row3Subtitle" />
              </Row.Subtitle>
            </Row>
          </div>
        </PopupElement.Body>
        <PopupElement.FooterButton
          class={styles.popupButton}
          iconLeft="okay"
          langKey="StarsRating.Understood"
        />
      </PopupElement>
    );
  })
}
