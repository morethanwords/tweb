# Telegram Features — Complete List & Implementation Status

Legend:
- ✅ = Implemented
- ⚠️ = Partially implemented / limited
- ❌ = Not implemented / missing
- 🚫 = Not applicable to web platform

---

## 1. MESSAGING — CORE

### 1.1 Text Messages

| Feature | Status | Notes |
|---------|--------|-------|
| Plain text messages | ✅ | |
| Bold, italic, underline, strikethrough | ✅ | |
| Monospace / code blocks with syntax | ✅ | `messageEntityPre` |
| Spoiler text | ✅ | |
| Collapsible blockquotes | ✅ | |
| Custom emoji inline in text | ✅ | `messageEntityCustomEmoji` |
| @Mentions (username & name) | ✅ | |
| Hashtags & cashtags | ✅ | |
| URLs & hyperlinks | ✅ | |
| Bot commands | ✅ | |
| Formatted dates | ✅ | `messageEntityFormattedDate` |

### 1.2 Message Media Types

| Feature | Status | Notes |
|---------|--------|-------|
| Photos (single & album) | ✅ | With spoiler blur |
| Videos | ✅ | With spoiler blur, covers |
| Round video messages (video notes) | ✅ | |
| Voice messages (audio notes) | ✅ | |
| Documents / files | ✅ | |
| Stickers (static, animated, video) | ✅ | WebP, TGS/Lottie, WebM |
| GIFs | ✅ | |
| Location sharing (static) | ✅ | |
| Live location sharing | ⚠️ | Display only, no GPS sending from web |
| Contacts (vCard) | ✅ | |
| Polls (regular & quiz) | ✅ | `appPollsManager` |
| Dice / animated random | ✅ | All dice emoji types |
| Games (HTML5 inline) | ❌ | |
| Invoices / payment requests | ✅ | |
| Web page previews | ✅ | Large/small media toggle |
| Venue (location + place info) | ✅ | |
| Paid media (Stars paywall) | ✅ | `messageMediaPaidMedia` |
| Stories (shared as message) | ✅ | |
| Giveaway posts | ✅ | |
| Giveaway results | ✅ | |
| To-Do Lists / Checklists | ✅ | `messageMediaToDo`, `checklist.tsx` |
| Video stream embed | ✅ | RTMP/group call streams |
| Call messages | ✅ | |

### 1.3 Service Messages / Actions

| Feature | Status | Notes |
|---------|--------|-------|
| Chat/channel create, edit, photo | ✅ | |
| User add/remove/join/leave | ✅ | |
| Join by link / request / invite | ✅ | |
| Pin/unpin message | ✅ | |
| History cleared | ✅ | |
| Game score | ❌ | |
| Payment sent/received/refunded | ✅ | |
| Phone call | ✅ | |
| Screenshot taken | ❌ | |
| Secure values sent (Passport) | ❌ | |
| Group call started/ended | ✅ | |
| Set messages TTL | ✅ | |
| Set chat theme | ✅ | |
| Gift Premium | ✅ | |
| Topic created/edited/deleted | ✅ | |
| Gift code / giveaway | ✅ | |
| Star gift / star gift unique | ✅ | |
| Conference call | ❌ | |
| Suggested post actions | ✅ | |
| Gift TON | ✅ | |
| Discussion started | ✅ | |
| No-forwards toggle | ✅ | |

### 1.4 Message Features

| Feature | Status | Notes |
|---------|--------|-------|
| Reply to messages | ✅ | Including threads, quote reply |
| Forward messages | ✅ | With/without attribution, with avatar |
| Edit messages | ✅ | Text and media |
| Delete messages (self & all) | ✅ | |
| Pin messages | ✅ | |
| Scheduled messages | ✅ | Send at date/time |
| Repeated messages | ❌ | |
| Sending status (sent/delivered/read) | ✅ | |
| Message effects | ✅ | Animated effects |
| Read receipts (who read) | ✅ | |
| Message translation | ✅ | Auto & manual |
| Select / multi-select messages | ✅ | |
| Report messages | ✅ | |
| Typing indicators | ✅ | All typing action types |
| Message search (in-chat & global) | ✅ | |
| Saved Messages | ✅ | With peer organization |
| Saved Messages tags | ✅ | Premium |
| Voice-to-text transcription | ✅ | Premium, transcribe voice |
| Fact-check annotations | ✅ | `can_edit_factcheck` |
| Copy text / copy link | ✅ | |
| Download media | ✅ | |
| Effects | ✅ | |
| Captions Above Media | ✅ | |
| View-Once Media | 🚫 | |

### 1.5 Drafts

| Feature | Status | Notes |
|---------|--------|-------|
| Message drafts (per-chat) | ✅ | `appDraftsManager` |
| Cloud drafts (synced) | ✅ | |

---

## 2. STICKERS, EMOJI & GIFs

| Feature | Status | Notes |
|---------|--------|-------|
| Sticker packs (install/remove/reorder) | ✅ | |
| Static stickers (WebP) | ✅ | |
| Animated stickers (TGS/Lottie) | ✅ | |
| Video stickers (WebM) | ✅ | |
| Video stickers (WebM) (Safari) | 🚫 | |
| Premium stickers | ✅ | |
| Favorite stickers | ✅ | |
| Recent stickers | ✅ | |
| Sticker suggestions by emoji | ✅ | |
| Custom emoji packs | ✅ | Premium |
| Emoji status (profile) | ✅ | |
| Group/channel emoji pack | ✅ | |
| Interactive emoji (full-screen) | ✅ | |
| GIF search (inline bots) | ✅ | |
| Saved GIFs | ✅ | |
| Emoji suggestions while typing | ✅ | |
| Emoji categories & search | ✅ | |
| Emoji sounds | ✅ | |
| Animated emoji (single-emoji messages) | ✅ | |

---

## 3. CHATS & GROUPS

### 3.1 Chat Types

| Feature | Status | Notes |
|---------|--------|-------|
| Private chats (1-on-1) | ✅ | |
| Basic groups | ✅ | |
| Supergroups (up to 200k) | ✅ | |
| Gigagroups | ❌ | |
| Channels | ✅ | |
| Saved Messages | ✅ | |

### 3.2 Group Features

| Feature | Status | Notes |
|---------|--------|-------|
| Group photo/video (animated avatar) | ⚠️ | Only static |
| Group description | ✅ | |
| Invite links (permanent/temporary) | ✅ | `appChatInvitesManager` |
| Slow mode | ✅ | |
| Admin titles / custom ranks | ⚠️ | Admin-only ranks |
| Full admin rights system | ✅ | All permission flags |
| Full banned rights system | ✅ | All restriction flags |
| Anti-spam (built-in) | ✅ | |
| Hidden members | ✅ | |
| Join requests (admin approval) | ✅ | |
| Join-to-send | ✅ | |
| Recent actions / admin log | ✅ | Detailed with filtering |
| Group statistics | ✅ | `appStatisticsManager` |
| Content protection (no forwards) | ✅ | |
| Pre-history hidden | ✅ | |
| Linked discussion chat | ✅ | |
| Group location | ✅ | |
| Default send-as | ✅ | |
| Auto-translation per channel | ✅ | |
| Online member count | ✅ | |
| Similar channels | ✅ | |
| Default permissions editing | ✅ | |
| Leaving Groups to a New Admin | ❌ | |
| Ownership Transfer | ❌ | |

### 3.3 Forum / Topics

| Feature | Status | Notes |
|---------|--------|-------|
| Forum mode | ✅ | |
| Create/edit/delete topics | ✅ | With custom emoji icons |
| Pin topics | ✅ | |
| Topic permissions | ✅ | |
| View forum as messages | ✅ | |
| General topic | ✅ | |
| Bot forum view | ✅ | |
| Forum tabs | ✅ | `forumTab/` |

### 3.4 Mono-Forum / Channel Direct Messages

| Feature | Status | Notes |
|---------|--------|-------|
| Mono-forum (channel DMs) | ✅ | |
| Channel Direct Messages tab | ✅ | `channelDirectMessages.tsx` |

### 3.5 Chat Folders

| Feature | Status | Notes |
|---------|--------|-------|
| Custom chat folders | ✅ | |
| Folder editing (include/exclude) | ✅ | |
| Shared folders | ✅ | With invite links |
| Folder pinned chats | ✅ | |

### 3.6 Chat Settings

| Feature | Status | Notes |
|---------|--------|-------|
| Per-chat themes | ✅ | |
| Per-chat wallpaper | ✅ | |
| Per-chat notifications | ✅ | |
| Auto-delete messages (TTL) | ✅ | |
| Chat reactions config | ✅ | |
| Peer colors (name colors) | ✅ | |
| Profile colors | ✅ | |

### 3.7 Channel Features

| Feature | Status | Notes |
|---------|--------|-------|
| Channel signatures (author name) | ✅ | |
| Signature profiles (author links) | ✅ | |
| Channel statistics | ✅ | |
| Channel boosts | ✅ | `appBoostsManager` |
| Channel level unlocks | ❌ | |
| Sponsored messages | ✅ | |
| Channel subscription (paid) | ✅ | |
| Paid messages (Stars) | ✅ | |
| Paid reactions | ✅ | |
| Paid media | ✅ | |
| Suggested posts | ✅ | |
| Channel revenue | ✅ | |
| Restrict sponsored | ✅ | |
| Star gifts on channels | ✅ | |
| Summaries | ✅ | |
| Super Channels | ✅ | |

---

## 4. TELEGRAM PREMIUM

| Feature | Status | Notes |
|---------|--------|-------|
| Premium subscription purchase | ✅ | `premium.ts` popup |
| Stories (priority, stealth, etc.) | ✅ | |
| Doubled limits | ✅ | Limit comparison UI |
| Voice-to-text transcription | ✅ | |
| Faster downloads | ✅ | Speed multiplier |
| Real-time translation | ✅ | |
| Custom emoji in text | ✅ | |
| Larger file uploads (4 GB) | ✅ | |
| Emoji status | ✅ | |
| Extra peer/name colors | ✅ | |
| Custom chat wallpapers | ✅ | |
| Profile badge | ✅ | |
| No ads | ✅ | |
| Infinite reactions | ✅ | |
| Premium stickers | ✅ | |
| Last seen privacy | ✅ | |
| Message privacy | ✅ | |
| Saved message tags | ✅ | |
| Gift Premium to others | ✅ | |
| Gift codes | ✅ | |
| Disable Sharing in Private Chats | ✅ | |
| Video avatars | ❌ | |
| App icons (custom) | 🚫 | Mobile only |

---

## 5. TELEGRAM STARS & MONETIZATION

### 5.1 Stars Currency

| Feature | Status | Notes |
|---------|--------|-------|
| Stars balance display | ✅ | Floating balance |
| Stars purchase | ✅ | |
| Stars payments | ✅ | |
| Stars revenue & withdrawal | ✅ | |
| Stars subscriptions | ✅ | |
| Stars exchange rates | ✅ | |
| Stars commission | ✅ | |

### 5.2 Star Gifts

| Feature | Status | Notes |
|---------|--------|-------|
| Send star gifts | ✅ | `sendGift.tsx` |
| Star gift info | ✅ | `starGiftInfo.tsx` |
| Star gift upgrade (to unique) | ✅ | Attributes: model, backdrop, pattern |
| Star gift wear (display on profile) | ✅ | `starGiftWear.tsx` |
| Star gift transfer | ✅ | `transferStarGift.tsx` |
| Star gift sell / resale | ✅ | `sellStarGift.tsx` |
| Star gift buy resale | ✅ | `buyResaleGift.tsx` |
| Star gift collections | ✅ | `stargiftsGrid.tsx` |
| Star gift pinned to profile | ✅ | |
| Star gift value | ✅ | |
| Star gift auctions | ❌ | |
| Star gift purchase offers | ✅ | `createStarGiftOffer.tsx` |
| Star gift crafting | ❌ | |
| Star gift themes | ❌ | |
| Upgrading Gifts for Other Users | ❌ | |
| Create star gift offer | ✅ | |
| Disallowed gifts settings | ❌ | |

### 5.3 TON Integration

| Feature | Status | Notes |
|---------|--------|-------|
| TON gifts | ✅ | Protocol support |
| TON topup URL | ✅ | Config support |
| TON resale for gifts | ✅ | Config: amounts/commission |

### 5.4 Giveaways & Boosts

| Feature | Status | Notes |
|---------|--------|-------|
| Create giveaways | ✅ | |
| Giveaway configuration | ✅ | Countries, filters, period |
| Channel boosts | ✅ | |
| Boost via gifts | ✅ | `boostsViaGifts.tsx` |
| Reassign boosts | ✅ | `reassignBoost.tsx` |

### 5.5 Paid Content

| Feature | Status | Notes |
|---------|--------|-------|
| Paid messages | ✅ | Stars pricing |
| Paid media posts | ✅ | |
| Paid reactions | ✅ | |
| Suggested posts | ✅ | Full UI |
| Stars rating | ✅ | `starsRating.tsx` |
| Affiliate/referral program | ❌ | |

---

## 6. STORIES

| Feature | Status | Notes |
|---------|--------|-------|
| Post stories (photos & videos) | ❌ | |
| Story viewer (full-screen) | ✅ | `viewer.tsx` |
| Story list (horizontal bar) | ✅ | `list.tsx` |
| Profile stories | ✅ | `profileList.tsx` |
| Pinned/saved stories | ✅ | |
| Story archive | ✅ | |
| Story reactions | ✅ | |
| Story views (who viewed) | ⚠️ | Basic list, no filtering |
| Story captions with formatting | ✅ | |
| Story privacy settings | ✅ | |
| Story forwarding | ✅ | |
| Stealth mode | ✅ | `storiesStealthMode.tsx` |
| Weather widget | ❌ | |
| Live Stories | ❌ | |

---

## 7. CALLS

### 7.1 Private Calls

| Feature | Status | Notes |
|---------|--------|-------|
| Voice calls (P2P) | ✅ | `appCallsManager`, `call/` |
| Video calls | ✅ | |
| Call privacy settings | ✅ | |
| P2P call privacy | ✅ | |
| Settings | ❌ | |

### 7.2 Group Calls (Voice Chats)

| Feature | Status | Notes |
|---------|--------|-------|
| Group voice chats | ✅ | `appGroupCallsManager` |
| Group video calls | ✅ | |
| Participant management | ✅ | Mute, volume, etc. |
| Screen sharing | ✅ | |
| Group call scheduling | ✅ | |
| Settings | ❌ | |

### 7.3 Conference Calls

| Feature | Status | Notes |
|---------|--------|-------|
| Conference calls (multi-party) | ❌ | |
| P2P to conference escalation | ❌ | |
| Shareable call links | ❌ | |

### 7.4 RTMP Live Streaming

| Feature | Status | Notes |
|---------|--------|-------|
| RTMP streaming | ✅ | `rtmp/` |
| Live stream viewer UI | ✅ | Topbar live |
| Admin stream controls | ✅ | |
| Record stream | ✅ | |
| Output device selection | ✅ | |

---

## 8. BOTS & MINI APPS

### 8.1 Bot Interaction

| Feature | Status | Notes |
|---------|--------|-------|
| Bot commands with autocomplete | ✅ | `commandsHelper.ts` |
| Inline bots (@bot query) | ✅ | `appInlineBotsManager` |
| Bot reply keyboards | ✅ | `replyKeyboard.ts` |
| Inline keyboards (buttons) | ✅ | All button types |
| Bot menu button | ✅ | |
| Bot info (description, commands) | ✅ | |
| Attach menu bots | ✅ | `appAttachMenuBotsManager` |
| Colored Buttons | ✅ | |

### 8.2 Mini Apps (Web Apps)

| Feature | Status | Notes |
|---------|--------|-------|
| Bot web apps | ✅ | `webApp.tsx` |
| Web app popup (full-screen) | ✅ | `popups/webApp.ts` |
| Web app location access | ✅ | `webAppLocationAccess.tsx` |
| Web app emoji status access | ✅ | `webAppEmojiStatusAccess.tsx` |
| Web app prepared message | ✅ | |
| Allowed protocols | ✅ | |
| Telegram WebView container | ✅ | `telegramWebView.ts` |

---

## 9. MEDIA EDITOR

| Feature | Status | Notes |
|---------|--------|-------|
| Photo crop | ✅ | `cropHandles.tsx` |
| Adjustments (brightness, etc.) | ✅ | `adjustments.ts` |
| Brush / drawing tools | ✅ | `brushCanvas.tsx` |
| Text overlay | ✅ | `textLayerContent.tsx` |
| Stickers overlay | ✅ | `stickerLayerContent.tsx` |
| Color picker | ✅ | `colorPicker.tsx` |
| WebGL rendering | ✅ | `webgl/` |
| Video editing | ✅ | `videoControls.tsx` |
| Rotation wheel | ✅ | `rotationWheel.tsx` |

---

## 10. PRIVACY & SECURITY

### 10.1 Privacy Settings

| Feature | Status | Notes |
|---------|--------|-------|
| Last seen & online | ✅ | |
| Profile photo visibility | ✅ | |
| Phone number visibility | ✅ | |
| Added by phone | ✅ | |
| Bio / About visibility | ✅ | |
| Birthday visibility | ✅ | |
| Forwarded messages linking | ✅ | |
| Phone calls | ✅ | |
| P2P calls | ✅ | |
| Group/channel invites | ✅ | |
| Voice messages | ✅ | |
| Messages / new chats | ✅ | Premium |
| Paid messages (no-paid exceptions) | ✅ | |
| Gifts | ❌ | |
| Saved music visibility | ✅ | |

### 10.2 Security Features

| Feature | Status | Notes |
|---------|--------|-------|
| Two-factor authentication (2FA) | ✅ | Password, email, hint |
| Passcode lock | ✅ | `passcodeLock/` |
| Passkeys (FIDO2/WebAuthn) | ✅ | `passkey.tsx` |
| Active sessions management | ✅ | |
| Active web sessions | ✅ | |
| Login email change | ✅ | |
| QR code login | ✅ | |
| Blocked users | ✅ | |
| Content protection (no forwards) | ✅ | |
| Read dates privacy | ✅ | `toggleReadDate.tsx` |
| Account freeze handling | ✅ | `frozen.tsx` |
| Secret chats (E2E encrypted) | ❌ | |
| Telegram Passport (full flow) | ❌ | |
| Age verification | ✅ | `ageVerification.tsx` |

### 10.3 Account Management

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-account support | ✅ | |
| Edit profile | ✅ | |
| Multiple usernames | ✅ | `appUsernamesManager` |
| Collectible usernames | ❌ | No info about Fragment |
| Seamless login | ✅ | `appSeamlessLoginManager` |
| Log out | ✅ | |
| Delete account | ❌ | |

---

## 11. TELEGRAM BUSINESS

| Feature | Status | Notes |
|---------|--------|-------|
| Business work hours | ⚠️ | View-only (`businessHours.tsx`) |
| Business location | ⚠️ | View-only |
| Business greeting message | ⚠️ | View-only |
| Business away message | ⚠️ | View-only |
| Business intro | ⚠️ | View-only (`appBusinessManager`) |
| Business chat links | ⚠️ | View-only |
| Quick replies | ⚠️ | View-only |

---

## 12. SEARCH & DISCOVERY

| Feature | Status | Notes |
|---------|--------|-------|
| Global search | ✅ | `appSearch.ts` |
| In-chat search | ✅ | `topbarSearch.tsx` |
| Search by date | ✅ | |
| Shared media browser | ✅ | `appSearchSuper.ts` |
| Hashtag search | ✅ | |
| Similar channels | ✅ | `similarChannels.tsx` |
| People nearby | ✅ | `peopleNearby.ts` |
| Recommended channels | ✅ | |
| Global posts search | ✅ | `globalPostsSearch.tsx` |

---

## 13. NOTIFICATIONS

| Feature | Status | Notes |
|---------|--------|-------|
| Desktop/push notifications | ✅ | `appNotificationsManager` |
| Per-chat notification settings | ✅ | |
| Silent messages | ✅ | |
| Notification sounds | ✅ | |
| Notification preview settings | ✅ | |
| Custom notification sound | 🚫 | |

---

## 14. SETTINGS & CUSTOMIZATION

| Feature | Status | Notes |
|---------|--------|-------|
| Language selection | ✅ | `language.tsx` |
| Theme (dark/light/custom) | ✅ | `appThemesManager` |
| Chat backgrounds & wallpapers | ✅ | |
| Animation settings | ✅ | |
| Power saving mode | ✅ | `powerSaving.ts` |
| Auto-download settings | ✅ | `autoDownload/` |
| Storage management | ✅ | `dataAndStorage/` |
| Quick reaction selection | ✅ | `quickReaction.ts` |
| Sticker & emoji settings | ✅ | `stickersAndEmoji.ts` |
| Archive settings | ✅ | `archiveSettingsTab.tsx` |
| Auto-delete messages | ✅ | `autoDeleteMessages/` |

---

## 15. INSTANT VIEW & BROWSER

| Feature | Status | Notes |
|---------|--------|-------|
| Instant View (article reader) | ✅ | `instantView.tsx` |
| In-app browser | ✅ | `browser.tsx` |
| Web page previews | ✅ | Large/small toggle |

---

## 16. MEDIA PLAYBACK

| Feature | Status | Notes |
|---------|--------|-------|
| Audio player (music) | ✅ | `audio.ts` |
| Saved music | ✅ | `savedMusic.tsx` |
| Video player (inline & fullscreen) | ✅ | |
| Media viewer (photos/videos) | ✅ | `appMediaViewer.ts` |
| RTMP media viewer | ✅ | `appMediaViewerRtmp.ts` |
| Playback rate control | ✅ | `playbackRateButton.ts` |
| Volume control | ✅ | `volumeSelector.ts` |
| HLS streaming | ✅ | |

---

## 17. ADMIN & MODERATION

| Feature | Status | Notes |
|---------|--------|-------|
| Admin log viewer | ✅ | 25+ files in `adminRecentActions/` |
| Admin log filtering | ✅ | `logFiltersPopup/` |
| Member management | ✅ | |
| Admin/rank editing | ✅ | Layer 223 |
| Group permissions | ✅ | `groupPermissions/` |
| Chat type management | ✅ | |
| Removed users list | ✅ | |
| Join requests management | ✅ | |
| Bulk delete (admin) | ✅ | `deleteMegagroupMessages.tsx` |

---

## 18. AUTHENTICATION

| Feature | Status | Notes |
|---------|--------|-------|
| Phone number login (SMS) | ✅ | `pageSignIn.ts` |
| QR code login | ✅ | `pageSignQR.ts` |
| Email recovery | ✅ | `pageEmailRecover.ts` |
| Sign up (registration) | ✅ | `pageSignUp.ts` |
| 2FA password on login | ✅ | `pagePassword.ts` |
| Passkey login (biometric) | ✅ | |
| Auth code verification | ✅ | `pageAuthCode.ts` |
| Email setup on sign in | ❌ | `auth.sentCodeTypeSetUpEmailRequired` |

---

## 19. MISC FEATURES

| Feature | Status | Notes |
|---------|--------|-------|
| Contact sharing / creation | ✅ | |
| Drag and drop files | ✅ | `dragAndDrop.ts` |
| Confetti animations | ✅ | `confetti.tsx` |
| Sparkles effects | ✅ | `sparkles.ts` |
| Connection status indicator | ✅ | `connectionStatus.ts` |
| Birthday display/suggestion | ✅ | `suggestBirthday.tsx` |
| Personal channel on profile | ⚠️ | View-only |
| Notes on user profiles | ✅ | `editContact.ts` |
| Emoji game outcomes | ❌ | |
| Virtual/lazy lists | ✅ | |
| Swipe gestures | ✅ | |
| Ripple effects | ✅ | |
| Log In With Telegram | ❌ | |
| Default Profile Tab | ❌ | |
| Video storyboards | ✅ | |
| Sponsored in Video player | ❌ | |
| Download manager | ❌ | |
| Delete by Date | ❌ | |
| Upgraded Device Management | ❌ | |
| QR code invite links | ❌ | |
| Chat Preview | ❌ | |
