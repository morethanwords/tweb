import Space from '@components/space';
import PhotoTsx from '@components/wrappers/photoTsx';
import {keepMe} from '@helpers/keepMe';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {Photo} from '@layer';
import {LangPackKey} from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createMemo, For, Show} from 'solid-js';
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
  pollViewerPayload?: DataPollViewerIdxDirectivePayload;
}) => {
  const middleware = createMiddleware().get();
  return (
    <div class='reply quote-like quote-like-border' use:dataPollViewerIdx={props.pollViewerPayload}>
      <div class='reply-content'>
        <div class='reply-title'>
          <I18nTsx key='Chat.Quiz.Explanation' />
        </div>
        <Show when={props.text}>
          <div class={classNames(styles.explanationText, 'reply-subtitle')}>
            {wrapRichText(props.text, {entities: props.entities, middleware})}
          </div>
        </Show>
        <Show when={props.photo}>
          <Space amount='0.5rem' />
          <div class={styles.explanationImage}>
            <PhotoTsx photo={props.photo} />
          </div>
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
    <I18nTsx key={key()} args={[props.votersCount.toString()]} />
  );
};
