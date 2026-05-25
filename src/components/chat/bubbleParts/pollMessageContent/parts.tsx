import Space from '@components/space';
import PhotoTsx from '@components/wrappers/photoTsx';
import VideoTsx from '@components/wrappers/videoTsx';
import {keepMe} from '@helpers/keepMe';
import mediaSizes from '@helpers/mediaSizes';
import formatNumber from '@helpers/number/formatNumber';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {Document, Photo} from '@layer';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createMemo, For, Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {usePollMessageContentProps} from './context';
import styles from './styles.module.scss';
import {dataPollViewerIdx, DataPollViewerIdxDirectivePayload, LocalTextWithEntities} from './utils';


keepMe(dataPollViewerIdx);

export const AvatarGroup = (props: {
  peerIds: PeerId[];
}) => {
  const {AvatarNewTsx} = useHotReloadGuard();
  const contextProps = usePollMessageContentProps();

  return (
    <div class={styles.avatarGroup}>
      <For each={props.peerIds.slice(0, 3)}>
        {(peerId, index) => (
          <div
            class={styles.avatarGroupItem}
            classList={{
              [styles.pushOverNext]: index() > 0,
              [styles.outgoing]: contextProps.isOutgoing
            }}
          >
            <div class={styles.avatarGroupItemWrapper}>
              <AvatarNewTsx class={styles.avatarGroupItemAvatar} size={24} peerId={peerId} />
            </div>
          </div>
        )}
      </For>
    </div>
  );
};

export const Explanation = (props: LocalTextWithEntities & {
  photo?: Photo.photo;
  video?: Document.document;
  pollViewerPayload?: DataPollViewerIdxDirectivePayload;
}) => {
  const {TranslatableMessageTsx} = useHotReloadGuard();
  const contextProps = usePollMessageContentProps();

  const middleware = createMiddleware().get();

  return (
    <div class={'reply quote-like quote-like-border ' + styles.explanation} use:dataPollViewerIdx={props.pollViewerPayload}>
      <div class='reply-content'>
        <div class='reply-title'>
          <I18nTsx key='Chat.Quiz.Explanation' />
        </div>
        <Show when={props.text}>
          <div class={classNames(styles.explanationText, 'reply-subtitle')}>
            <TranslatableMessageTsx
              peerId={contextProps.peerId}
              textWithEntities={{_: 'textWithEntities', text: props.text, entities: unwrap(props.entities)}}
              richTextOptions={{middleware, loadPromises: contextProps.loadPromises}}
            />
          </div>
        </Show>
        <Show when={props.photo}>
          <Space amount='0.5rem' />
          <div class={styles.explanationImage}>
            <PhotoTsx photo={props.photo} loadPromises={contextProps.loadPromises} autoDownloadSize={contextProps.autoDownload?.photo} />
          </div>
        </Show>

        <Show when={props.video && !props.photo}>
          <Space amount='0.5rem' />
          <VideoTsx
            doc={props.video}
            loadPromises={contextProps.loadPromises}
            group={contextProps.animationGroup}
            autoDownload={contextProps.autoDownload}
            boxWidth={mediaSizes.active.regular.width}
            boxHeight={mediaSizes.active.regular.height}
            withPreview
            lazyLoadQueue={contextProps.lazyLoadQueue || undefined}
            observer={contextProps.observer}
          />
        </Show>
      </div>
    </div>
  );
};

export type CommonProps = {
  closed?: boolean;
  hasCorrectAnswer?: boolean;
  showWhoVoted?: boolean;
};

export const PollType = (props: CommonProps) => {
  const key = createMemo((): LangPackKey => {
    if(props.closed) return 'Chat.Poll.Type.Closed';
    if(props.hasCorrectAnswer) return props.showWhoVoted ? 'Chat.Poll.Type.Quiz' : 'Chat.Poll.Type.AnonymousQuiz';
    return props.showWhoVoted ? 'Chat.Poll.Type.Public' : 'Chat.Poll.Type.Anonymous';
  });

  return (
    <I18nTsx key={key()} />
  );
};

export const PollVotes = (props: CommonProps & { votersCount: number }) => {
  const key = createMemo((): LangPackKey => {
    if(!props.votersCount) {
      if(props.closed) return 'Chat.Poll.TotalVotesResultEmpty';
      else return 'Chat.Poll.TotalVotesEmpty';
    }

    if(props.hasCorrectAnswer) return 'Chat.Quiz.MembersAnswered';

    return 'Chat.Poll.MembersVoted';
  });

  return (
    <I18nTsx key={key()} args={[formatNumber(props.votersCount, 1)]} />
  );
};
