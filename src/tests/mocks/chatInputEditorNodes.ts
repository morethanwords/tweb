import '@/tests/mocks/chatInputEditorUi';

vi.mock('@environment/webpSupport', () => ({default: true}));

vi.mock('@components/wrappers/document', () => ({
  default: vi.fn(async() => document.createElement('div'))
}));

vi.mock('@components/buttonMenuToggle', () => ({
  default: (options: {container?: HTMLElement}) => (
    options.container || document.createElement('button')
  )
}));

vi.mock('@components/chat/markupTooltip', () => ({
  default: {getInstance: () => ({setActiveMarkupButton() {}, hide() {}})}
}));

vi.mock('@lib/customEmoji/element', () => ({default: {create: vi.fn()}}));
vi.mock('@lib/customEmoji/renderer', () => ({CustomEmojiRendererElement: {create: vi.fn()}}));
