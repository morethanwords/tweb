import getUniqueCustomEmojisFromMessage from '@appManagers/utils/messages/getUniqueCustomEmojisFromMessage';
import {Message, MessageEntity, Poll, PollAnswer, TextWithEntities, TodoList, TodoItem} from '@layer';

function customEmoji(documentId: DocId, offset = 0, length = 2): MessageEntity.messageEntityCustomEmoji {
  return {
    _: 'messageEntityCustomEmoji',
    offset,
    length,
    document_id: documentId
  };
}

function textWithEntities(text: string, entities: MessageEntity[]): TextWithEntities.textWithEntities {
  return {_: 'textWithEntities', text, entities};
}

function pollAnswer(text: TextWithEntities.textWithEntities, option: Uint8Array): PollAnswer.pollAnswer {
  return {_: 'pollAnswer', text, option};
}

function makePollMessage(poll: Poll.poll): Message.message {
  return {
    _: 'message',
    id: 1,
    peer_id: {_: 'peerUser', user_id: 1},
    date: 0,
    message: '',
    pFlags: {},
    media: {
      _: 'messageMediaPoll',
      poll,
      results: {_: 'pollResults', pFlags: {}}
    }
  } as any as Message.message;
}

function todoItem(id: number, title: TextWithEntities.textWithEntities): TodoItem.todoItem {
  return {_: 'todoItem', id, title};
}

function makeTodoMessage(todo: TodoList.todoList): Message.message {
  return {
    _: 'message',
    id: 1,
    peer_id: {_: 'peerUser', user_id: 1},
    date: 0,
    message: '',
    pFlags: {},
    media: {
      _: 'messageMediaToDo',
      todo
    }
  } as any as Message.message;
}

describe('getUniqueCustomEmojisFromMessage', () => {
  test('collects custom emoji from the message text entities', () => {
    const message = {
      _: 'message',
      id: 2,
      peer_id: {_: 'peerUser', user_id: 1},
      date: 0,
      message: 'hi 🙂',
      entities: [customEmoji('333', 3)],
      pFlags: {}
    } as any as Message.message;

    expect(getUniqueCustomEmojisFromMessage(message)).toContain('333');
  });

  test('collects custom emoji from the poll QUESTION (regression)', () => {
    const message = makePollMessage({
      _: 'poll',
      id: '1',
      pFlags: {},
      question: textWithEntities('Q 🙂', [customEmoji('111')]),
      answers: [
        pollAnswer(textWithEntities('A', []), new Uint8Array([0]))
      ]
    } as any as Poll.poll);

    // The question's custom emoji (111) must be returned, not only the answers'.
    expect(getUniqueCustomEmojisFromMessage(message)).toContain('111');
  });

  test('collects custom emoji from poll answers', () => {
    const message = makePollMessage({
      _: 'poll',
      id: '1',
      pFlags: {},
      question: textWithEntities('Q', []),
      answers: [
        pollAnswer(textWithEntities('A 🙂', [customEmoji('200')]), new Uint8Array([0]))
      ]
    } as any as Poll.poll);

    expect(getUniqueCustomEmojisFromMessage(message)).toContain('200');
  });

  test('collects custom emoji from question AND answers, deduplicated', () => {
    const message = makePollMessage({
      _: 'poll',
      id: '1',
      pFlags: {},
      question: textWithEntities('Q 🙂', [customEmoji('111')]),
      answers: [
        pollAnswer(textWithEntities('A 🙂', [customEmoji('222')]), new Uint8Array([0])),
        pollAnswer(textWithEntities('B 🙂', [customEmoji('111')]), new Uint8Array([1]))
      ]
    } as any as Poll.poll);

    const result = getUniqueCustomEmojisFromMessage(message);
    expect(result).toContain('111');
    expect(result).toContain('222');
    // 111 appears in both question and an answer — must be deduplicated.
    expect(result.filter((id) => id === '111')).toHaveLength(1);
  });

  test('collects custom emoji from a to-do list title', () => {
    const message = makeTodoMessage({
      _: 'todoList',
      pFlags: {},
      title: textWithEntities('shopping 🙂', [customEmoji('300')]),
      list: []
    } as any as TodoList.todoList);

    expect(getUniqueCustomEmojisFromMessage(message)).toContain('300');
  });

  test('collects custom emoji from to-do list items', () => {
    const message = makeTodoMessage({
      _: 'todoList',
      pFlags: {},
      title: textWithEntities('shopping', []),
      list: [
        todoItem(1, textWithEntities('milk 🙂', [customEmoji('400')])),
        todoItem(2, textWithEntities('eggs 🙂', [customEmoji('500')]))
      ]
    } as any as TodoList.todoList);

    const result = getUniqueCustomEmojisFromMessage(message);
    expect(result).toContain('400');
    expect(result).toContain('500');
  });

  test('collects + dedups custom emoji across to-do title and items', () => {
    const message = makeTodoMessage({
      _: 'todoList',
      pFlags: {},
      title: textWithEntities('shopping 🙂', [customEmoji('600')]),
      list: [
        todoItem(1, textWithEntities('milk 🙂', [customEmoji('600')])),
        todoItem(2, textWithEntities('eggs 🙂', [customEmoji('700')]))
      ]
    } as any as TodoList.todoList);

    const result = getUniqueCustomEmojisFromMessage(message);
    expect(result).toContain('600');
    expect(result).toContain('700');
    // 600 appears in both title and an item — must be deduplicated.
    expect(result.filter((id) => id === '600')).toHaveLength(1);
  });
});
