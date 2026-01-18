import {createResource, Show} from 'solid-js';
import createMiddleware from '@helpers/solid/createMiddleware';
import {ForumTopic} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import styles from '@components/sidebarRight/tabs/adminRecentActions/topicName.module.scss';


export const TopicName = (props: {
  topic: ForumTopic;
}) => {
  const {wrapTopicIcon} = useHotReloadGuard();

  const topic = () => props.topic._ === 'forumTopic' ? props.topic : null;

  const [icon] = createResource(topic, (topic) => {
    if(!topic) return null;
    const middleware = createMiddleware().get();
    return wrapTopicIcon({
      topic,
      middleware
    });
  });

  return (
    <Show when={topic()}>
      <div class={styles.Container}>
        {icon()} {topic().title}
      </div>
    </Show>
  );
}
