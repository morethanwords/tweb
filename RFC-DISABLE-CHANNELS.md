# RFC: Отключение каналов в tweb

## Цель

Создать форк tweb, в котором каналы (broadcast channels) полностью отсутствуют как функциональность. Пользователь не должен видеть каналы в списке чатов, поиске, и не иметь возможности их создавать.

**Важно:** Супергруппы (megagroups) технически являются `channel` с флагом `megagroup: true`, поэтому фильтрация должна использовать `isBroadcast()`, а не `isChannel()`.

---

## Ключевые места в коде

| Файл | Назначение |
|------|------------|
| `src/lib/appManagers/appChatsManager.ts:320` | `isBroadcast()` - главный метод определения канала |
| `src/lib/appManagers/appPeersManager.ts:138` | `isBroadcast()` на уровне peerId |
| `src/lib/storages/filters.ts:256-265` | Фильтрация диалогов по типу |
| `src/components/appSearchSuper.ts:1945` | Поиск каналов |
| `src/components/sidebarLeft/tabs/newChannel.ts` | UI создания канала |
| `src/components/sidebarLeft/index.ts:1488` | Подсчёт каналов в сайдбаре |

---

## Подходы к реализации

### Подход 1: Центральный фильтр в DialogsStorage (Рекомендуемый)

**Суть:** Фильтровать каналы на уровне хранилища диалогов при получении/обновлении.

**Файлы для изменения:**
- `src/lib/storages/dialogs.ts` - добавить фильтр в методы получения диалогов

**Плюсы:**
- Один централизованный фильтр
- Каналы не попадают ни в какие списки
- Минимальные изменения

**Минусы:**
- Каналы всё ещё загружаются с сервера (трафик)
- Нужно обрабатывать edge cases (открытие по прямой ссылке)

**Примерная реализация:**
```typescript
// В DialogsStorage при обработке диалогов
private shouldHideDialog(peerId: PeerId): boolean {
  return this.appPeersManager.isBroadcast(peerId);
}
```

---

### Подход 2: Фильтр на уровне AppPeersManager

**Суть:** Добавить флаг "скрытый" для broadcast-каналов на уровне peer manager.

**Файлы для изменения:**
- `src/lib/appManagers/appPeersManager.ts` - добавить `isHiddenPeer()`

**Плюсы:**
- Единая точка проверки для всех компонентов
- Легко включать/выключать

**Минусы:**
- Каждый компонент должен вызывать проверку
- Больше точек интеграции

---

### Подход 3: Хирургическое удаление UI-элементов

**Суть:** Удалить все UI-элементы связанные с каналами, но оставить логику.

**Файлы для изменения:**
- `src/components/sidebarLeft/tabs/newChannel.ts` - удалить/скрыть
- `src/components/appSearchSuper.ts:1945` - убрать `loadChannels()`
- `src/components/sidebarLeft/tabs/includedChats.ts:219` - убрать кнопку фильтра
- Диалоги в списке - фильтровать при рендере

**Плюсы:**
- Точечные изменения
- Легко отслеживать что изменено

**Минусы:**
- Много точек изменения
- Легко пропустить что-то
- Каналы могут "протечь" в неожиданных местах

---

### Подход 4: Конфигурационный флаг (Для гибкости)

**Суть:** Добавить глобальный флаг `DISABLE_CHANNELS` и проверять его во всех местах.

**Файлы для изменения:**
- Создать `src/config/features.ts`
- Добавить проверки во все релевантные места

```typescript
// src/config/features.ts
export const FEATURES = {
  CHANNELS_ENABLED: false
};

// Использование
if (FEATURES.CHANNELS_ENABLED || !appPeersManager.isBroadcast(peerId)) {
  // показать диалог
}
```

**Плюсы:**
- Можно включать/выключать без пересборки (если вынести в runtime config)
- Легко поддерживать обе версии

**Минусы:**
- Код засоряется условиями
- Сложнее поддерживать

---

## Рекомендуемый план реализации

### Этап 1: Централизованный фильтр (Подход 1)

1. **`src/lib/storages/dialogs.ts`** - фильтровать broadcast-диалоги:
   - В методе `getDialogs()`
   - В обработчиках обновлений диалогов

2. **`src/lib/appManagers/appMessagesManager.ts`** - игнорировать сообщения из каналов:
   - В `saveMessages()`
   - В `handleUpdate()` для `updateNewChannelMessage`

### Этап 2: Скрытие UI создания

3. **`src/components/sidebarLeft/tabs/newChannel.ts`** - удалить или заблокировать

4. **`src/components/sidebarLeft/index.ts`** - убрать кнопку "New Channel" из меню

### Этап 3: Фильтрация поиска

5. **`src/components/appSearchSuper.ts`**:
   - Удалить `loadChannels()` метод
   - Убрать секцию "Similar Channels"
   - Фильтровать результаты глобального поиска

### Этап 4: Обработка edge cases

6. **Ссылки на каналы (t.me/channel)** - показывать заглушку, блокировать переход
   - `src/lib/appManagers/internalLinkProcessor.ts:235-326` — обработка кликов на t.me ссылки
   - `src/lib/appManagers/appImManager.ts:1518-1534` — `openUsername()`, добавить проверку `isBroadcast()`

7. **Пересланные сообщения** - показывать контент, но переход в канал заблокирован
   - `src/components/chat/bubbles.ts:7991` — устанавливает `data-peerId` на заголовок форварда
   - `src/components/chat/bubbles.ts:8504-8522` — `createTitle()`, здесь блокировать клик для каналов

8. **Связанные каналы у групп** - группы показываем, linked channel скрываем
   - `src/components/sidebarRight/tabs/editChat.ts:375-403` — скрыть секцию linked channel
   - `src/components/sidebarRight/tabs/chatDiscussion.ts` — скрыть/отключить весь таб

---

## Принятые решения

| Вопрос | Решение |
|--------|---------|
| **Ссылки на каналы** | Показывать заглушку. Главное — нельзя перейти в канал |
| **Пересланные сообщения из каналов** | Показывать контент, но переход в канал заблокирован |
| **Обсуждения (linked chat)** | Группы оставить, каналы убрать |
| **Создание каналов** | Только убрать UI, API не блокировать |

---

## Полный список файлов для изменения

### Этап 1: Фильтр диалогов
| Файл | Изменение |
|------|-----------|
| `src/lib/storages/dialogs.ts` | Фильтровать broadcast при получении диалогов |

### Этап 2: Скрытие UI создания
| Файл | Изменение |
|------|-----------|
| `src/components/sidebarLeft/index.ts` | Убрать кнопку "New Channel" |
| `src/components/sidebarLeft/tabs/newChannel.ts` | Удалить или заглушить |

### Этап 3: Фильтрация поиска
| Файл | Изменение |
|------|-----------|
| `src/components/appSearchSuper.ts` | Убрать `loadChannels()`, фильтр результатов |
| `src/components/sidebarLeft/tabs/includedChats.ts` | Убрать кнопку фильтра "Channels" |

### Этап 4: Edge cases
| Файл | Изменение |
|------|-----------|
| `src/lib/appManagers/appImManager.ts` | Заглушка при переходе в канал |
| `src/lib/appManagers/internalLinkProcessor.ts` | Блокировать t.me/channel ссылки |
| `src/components/chat/bubbles.ts` | Блокировать клик на форвард из канала |
| `src/components/sidebarRight/tabs/editChat.ts` | Скрыть linked channel секцию |
| `src/components/sidebarRight/tabs/chatDiscussion.ts` | Скрыть/отключить таб |

### Сводка
| Этап | Файлов | Сложность |
|------|--------|-----------|
| Фильтр диалогов | 1 | Низкая |
| Скрытие UI создания | 2 | Низкая |
| Фильтрация поиска | 2 | Средняя |
| Edge cases | 5 | Средняя |
| **Итого** | **10 файлов** | — |

---

## Риски

1. **Обновления upstream** - при мерже с основным tweb могут быть конфликты
2. **Новые места появления каналов** - Telegram может добавить новые фичи с каналами
3. **Связанные фичи** - некоторые фичи групп могут зависеть от channel API

---

## Альтернативы

### Userscript/Extension
Вместо форка можно написать расширение браузера, которое скрывает каналы через CSS и перехватывает события.

**Плюсы:** Не нужно поддерживать форк
**Минусы:** Хрупкое решение, ломается при обновлениях

### Серверный прокси
MTProto прокси который фильтрует каналы на уровне API.

**Плюсы:** Работает с любым клиентом
**Минусы:** Сложно реализовать, latency
