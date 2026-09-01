import Row from '@components/rowTsx';
import {Middleware} from '@helpers/middleware';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import {i18n} from '@lib/langPack';

/**
 * The "Invite via Link" row that sits above the people in the conference
 * invite picker — tdesktop's `ConfInviteController::addShareLinkButton`
 * (calls_group_invite_controller.cpp:661). Not everyone worth calling is in
 * the list, so the link is offered in the same place the picking happens.
 */
export default function createInviteViaLinkRow(options: {
  middleware: Middleware,
  onClick: () => void
}) {
  return wrapSolidComponent(() => (
    <Row
      clickable={options.onClick}
      role="button"
      tabIndex={0}
    >
      <Row.Icon icon="link" />
      <Row.Title>{i18n('ConferenceCall.Invite.ViaLink')}</Row.Title>
    </Row>
  ), options.middleware);
}
