import type {ShellDocument} from './types';
import {validateDocument} from './document';
import {FolderDefaults} from './defaults';

/** Local content deliberately promises no subscription check, payment or external delivery. */
export function createFixture(): ShellDocument {
  return validateDocument({
    schemaVersion: 5,
    id: 'ai-bot-example',
    bot: {username: '@MyAIBot', title: 'AI Generated Bot', status: 'bot'},
    entryStepId: 'start',
    nextStepNumber: 8,
    folderOrder: ['start-folder', 'menu-folder'],
    folders: {
      'start-folder': {stepIds: ['start', 'offer', 'material'], fallbackStepId: 'start-fallback'},
      'menu-folder': {stepIds: ['menu', 'details'], fallbackStepId: 'menu-fallback'}
    },
    steps: {
      start: {number: 1, messageIds: ['start-message']},
      offer: {number: 2, messageIds: ['offer-message']},
      details: {number: 3, messageIds: ['details-message']},
      material: {number: 4, messageIds: ['material-message']},
      menu: {number: 5, messageIds: ['menu-message']},
      'start-fallback': {number: 6, messageIds: ['start-fallback-message']},
      'menu-fallback': {number: 7, messageIds: ['menu-fallback-message']}
    },
    messages: {
      'start-fallback-message': {rows: [{id: 'start-fallback-actions', buttonIds: ['start-fallback-back']}]},
      'menu-fallback-message': {rows: [{id: 'menu-fallback-actions', buttonIds: ['menu-fallback-back']}]},
      'start-message': {rows: [{id: 'start-actions', buttonIds: ['start-offer', 'start-menu']}]},
      'offer-message': {rows: [{id: 'offer-actions', buttonIds: ['offer-material']}, {id: 'offer-details', buttonIds: ['offer-more', 'offer-menu']}]},
      'details-message': {rows: [{id: 'details-actions', buttonIds: ['details-material', 'details-menu']}]},
      'material-message': {rows: [{id: 'material-actions', buttonIds: ['material-menu']}]},
      'menu-message': {rows: [{id: 'menu-top', buttonIds: ['menu-offer', 'menu-details']}, {id: 'menu-bottom', buttonIds: ['menu-material', 'menu-start']}]}
    },
    buttons: {
      'start-fallback-back': {targetStepId: 'start', color: 'default'},
      'menu-fallback-back': {targetStepId: 'menu', color: 'default'},
      'start-offer': {targetStepId: 'offer', color: 'default'}, 'start-menu': {targetStepId: 'menu', color: 'default'},
      'offer-material': {targetStepId: 'material', color: 'default'}, 'offer-more': {targetStepId: 'details', color: 'default'}, 'offer-menu': {targetStepId: 'menu', color: 'default'},
      'details-material': {targetStepId: 'material', color: 'default'}, 'details-menu': {targetStepId: 'menu', color: 'default'},
      'material-menu': {targetStepId: 'menu', color: 'default'},
      'menu-offer': {targetStepId: 'offer', color: 'default'}, 'menu-details': {targetStepId: 'details', color: 'default'},
      'menu-material': {targetStepId: 'material', color: 'default'}, 'menu-start': {targetStepId: 'start', color: 'default'}
    },
    content: {
      folders: {'start-folder': {title: 'Старт'}, 'menu-folder': {title: 'Меню'}},
      steps: {
        'start-fallback': {title: FolderDefaults.fallbackTitle}, 'menu-fallback': {title: FolderDefaults.fallbackTitle},
        start: {title: 'Знакомство'},
        offer: {title: 'Что внутри материала'},
        details: {title: 'Как попробовать'},
        material: {title: 'Материал в разговоре'},
        menu: {title: 'Меню'}
      },
      messages: {
        'start-fallback-message': FolderDefaults.fallbackText, 'menu-fallback-message': FolderDefaults.fallbackText,
        'start-message': 'Привет! Я — бот блога об AI и творческих экспериментах. Здесь можно попробовать короткую практику: превратить свою идею в понятный запрос к AI.\n\nВыбери, с чего начать: посмотреть материал или узнать, как он устроен.',
        'offer-message': 'Три шага от идеи к первому результату:\n\n1. Опиши задачу своими словами.\n2. Добавь контекст и ограничения.\n3. Попроси конкретный результат и проверь его.\n\nКороткий материал можно прочитать прямо здесь. Для начала не нужны сложные настройки или опыт программирования.',
        'details-message': 'Возьми одну реальную задачу: придумать заголовок, разобрать заметки или подготовить план небольшого эксперимента.\n\nСначала сформулируй, для кого нужен результат. Затем добавь исходные данные. В конце объясни, что будет считаться хорошим ответом.\n\nНе отправляй личные данные других людей. Ответ AI проверяй по своим источникам: уверенный тон не гарантирует точность.',
        'material-message': 'Шаблон запроса, который можно скопировать:\n\n«Моя задача: …\nДля кого: …\nЧто уже известно: …\nОграничения: …\nНужен результат в виде: …\nСначала укажи, каких данных не хватает».\n\nПроверь один ответ на небольшой задаче. Если получилось полезно — сохрани удачный запрос и улучшай его на следующем примере.',
        'menu-message': 'Куда перейти?\n\nМатериал содержит готовый шаблон запроса. Раздел «Как попробовать» поможет выбрать первую задачу. В любой момент можно вернуться к началу разговора.'
      },
      buttons: {
        'start-fallback-back': FolderDefaults.fallbackButton, 'menu-fallback-back': FolderDefaults.fallbackButton,
        'start-offer': 'Посмотреть материал', 'start-menu': 'Открыть меню',
        'offer-material': 'Прочитать шаблон', 'offer-more': 'Как попробовать', 'offer-menu': 'В меню',
        'details-material': 'Открыть шаблон', 'details-menu': 'В меню', 'material-menu': 'Другие разделы',
        'menu-offer': 'О материале', 'menu-details': 'Как попробовать', 'menu-material': 'Шаблон запроса', 'menu-start': 'В начало'
      }
    }
  });
}
