import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';

// A forum topic edited with no service message to tell of it (updateEditForumTopic, layer 233): what the update gives
// changes, the rest stays as it is — as an edit's service message does it (messageActionTopicEdit).
describe('AppMessagesManager and updateEditForumTopic', () => {
  function setup() {
    const manager = new AppMessagesManager() as any;
    const channelId = 5 as ChatId;
    const peerId = channelId.toPeerId(true);
    const topic: any = {_: 'forumTopic', id: 3, peerId, title: 'Plans', icon_emoji_id: '11', pFlags: {hidden: true}};
    const processTopicUpdate = vi.fn();
    const getForumTopicById = vi.fn();
    Object.assign(manager, {
      appPeersManager: {getPeerId: () => peerId},
      appMessagesIdsManager: {generateMessageId: (id: number, _channelId: ChatId) => _channelId === channelId ? 1000 + id : id},
      dialogsStorage: {
        getForumTopic: (_peerId: PeerId, topicId: number) => _peerId === peerId && topicId === 1003 ? topic : undefined,
        processTopicUpdate,
        getForumTopicById
      }
    });
    const scheduleHandleNewDialogs = vi.spyOn(manager, 'scheduleHandleNewDialogs').mockImplementation(() => {});
    const update = (fields: object) => manager.onUpdateEditForumTopic({_: 'updateEditForumTopic', peer: {_: 'peerChannel', channel_id: channelId}, ...fields});
    return {topic, update, processTopicUpdate, getForumTopicById, scheduleHandleNewDialogs};
  }

  test('only a title: the title changes, the icon and the flags stay', () => {
    const {topic, update, processTopicUpdate, scheduleHandleNewDialogs} = setup();
    update({topic_id: 3, title: 'Trips'});
    expect(topic).toMatchObject({title: 'Trips', icon_emoji_id: '11', pFlags: {hidden: true}});
    expect(topic.pFlags).not.toHaveProperty('closed');
    expect(processTopicUpdate).toHaveBeenCalledWith(topic, expect.objectContaining({title: 'Plans'}));
    expect(scheduleHandleNewDialogs).toHaveBeenCalledWith(topic.peerId, topic);
  });

  test('only closed: the topic closes, its title and its being hidden stay; a topic not here is not asked for', () => {
    const {topic, update, processTopicUpdate, getForumTopicById} = setup();
    update({topic_id: 3, closed: true});
    expect(topic).toMatchObject({title: 'Plans', icon_emoji_id: '11', pFlags: {hidden: true, closed: true}});
    expect(processTopicUpdate).toHaveBeenCalledTimes(1);

    update({topic_id: 3, closed: false, hidden: false});
    expect(topic.pFlags).toEqual({});

    update({topic_id: 4, title: 'Elsewhere'});
    expect(processTopicUpdate).toHaveBeenCalledTimes(2);
    expect(getForumTopicById).not.toHaveBeenCalled();
  });
});
