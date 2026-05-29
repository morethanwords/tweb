import {ConfettiContainer, ConfettiRef} from '@components/confetti';
import Space from '@components/space';
import PhotoTsx from '@components/wrappers/photoTsx';
import VideoTsx from '@components/wrappers/videoTsx';
import {keepMe} from '@helpers/keepMe';
import mediaSizes from '@helpers/mediaSizes';
import formatNumber from '@helpers/number/formatNumber';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {Document, MessageMedia, Photo} from '@layer';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createMemo, For, Match, onMount, Show, Switch} from 'solid-js';
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
              <AvatarNewTsx class={styles.avatarGroupItemAvatar} size={22} peerId={peerId} />
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
  document?: Document.document;
  geo?: MessageMedia.messageMediaGeo;
  pollViewerPayload?: DataPollViewerIdxDirectivePayload;
}) => {
  const {TranslatableMessageTsx, DocumentTsx} = useHotReloadGuard();
  const contextProps = usePollMessageContentProps();

  const middleware = createMiddleware().get();

  return (
    <div class={'reply quote-like quote-like-border ' + styles.explanation}>
      <div class='reply-content'>
        <div class='reply-title'>
          <I18nTsx key='Chat.Quiz.Explanation' />
        </div>
        <Show when={props.text}>
          <div class={classNames(styles.explanationText, 'reply-subtitle')}>
            <TranslatableMessageTsx
              peerId={contextProps.peerId}
              textWithEntities={{_: 'textWithEntities', text: props.text, entities: unwrap(props.entities)}}
              richTextOptions={{middleware, loadPromises: unwrap(contextProps.loadPromises)}}
            />
          </div>
        </Show>
        <Show when={props.photo || props.video || props.geo}>
          <Space amount='0.5rem' />
          <div class={styles.explanationMedia} use:dataPollViewerIdx={props.pollViewerPayload}>
            <Switch>
              <Match when={props.photo}>
                <PhotoTsx
                  photo={props.photo}
                  loadPromises={unwrap(contextProps.loadPromises)}
                  autoDownloadSize={contextProps.autoDownload?.photo}
                  uploadingFileName={contextProps.uploadingFileNames?.explanation}
                />
              </Match>
              <Match when={props.video}>
                <VideoTsx
                  doc={props.video}
                  loadPromises={unwrap(contextProps.loadPromises)}
                  group={contextProps.animationGroup}
                  autoDownload={unwrap(contextProps.autoDownload)}
                  boxWidth={mediaSizes.active.regular.width}
                  boxHeight={mediaSizes.active.regular.height}
                  withPreview
                  lazyLoadQueue={unwrap(contextProps.lazyLoadQueue) || undefined}
                  observer={unwrap(contextProps.observer)}
                  uploadingFileName={contextProps.uploadingFileNames?.explanation}
                />
              </Match>
              <Match when={props.geo}>
                <GeoPreview class={styles.geo} geo={props.geo} />
              </Match>
            </Switch>
          </div>
        </Show>

        <Show when={props.document && !props.photo && !props.video}>
          <Space amount='0.5rem' />
          <div class={styles.explanationDocument}>
            <DocumentTsx
              message={contextProps.message}
              doc={props.document}
              slot={0.2}
              loadPromises={unwrap(contextProps.loadPromises)}
              lazyLoadQueue={unwrap(contextProps.lazyLoadQueue) || undefined}
              autoDownloadSize={contextProps.autoDownload?.file}
              sizeType='documentName'
              canTranscribeVoice={false}
              uploadingFileName={contextProps.uploadingFileNames?.explanation}
            />
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
    <I18nTsx key={key()} args={[formatNumber(props.votersCount, 1)]} />
  );
};

export const AutoStartedConfetti = (props: { onEnd: () => void }) => {
  let ref: ConfettiRef;

  onMount(() => {
    ref?.create({
      mode: 'poppers',
      size: 4,
      speedScale: 0.6,
      count: 50
    });
  });

  return (
    <ConfettiContainer onEnd={props.onEnd} ref={ref} />
  );
};

export const GeoPreview = (props: {
  class?: string;
  geo: MessageMedia.messageMediaGeo;
}) => {
  const {wrapGeo} = useHotReloadGuard();
  const contextProps = usePollMessageContentProps();

  let attachmentDiv: HTMLDivElement;

  onMount(() => {
    const middleware = createMiddleware().get();

    wrapGeo({
      messageMedia: props.geo,
      attachmentDiv,
      wrapOptions: {
        middleware,
        lazyLoadQueue: unwrap(contextProps.lazyLoadQueue) || undefined,
        animationGroup: contextProps.animationGroup
      },
      middleware,
      loadPromises: unwrap(contextProps.loadPromises) ?? [],
      date: contextProps.message.date
    });
  });

  return <div ref={(el) => attachmentDiv = el} class={props.class} />;
};
