import {Show} from 'solid-js';
import Section from '@components/section';
import Row from '@components/rowTsx';
import {i18n} from '@lib/langPack';
import {Middleware} from '@helpers/middleware';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';

export type GroupCallParticipantsActions = {
  addPeople: () => void,
  shareLink: () => void
};

/**
 * The participants in a section of their own, the way the app lists people elsewhere, and under
 * the last of them what grows the call — tdesktop's `Members::setupAddMember`: a conference offers
 * "Add People" and "Share Link" there (calls_group_members.cpp).
 */
export default function createGroupCallParticipantsSection(options: {
  list: HTMLElement,
  actions?: GroupCallParticipantsActions,
  middleware: Middleware
}) {
  return wrapSolidComponent(() => (
    <Section class="group-call-participants-section" noShadow>
      {options.list}
      <Show when={options.actions}>
        {(actions) => (
          <>
            <Row clickable={() => actions().addPeople()}>
              <Row.Icon icon="adduser" noBackground />
              <Row.Title>{i18n('ConferenceCall.Invite.Title')}</Row.Title>
            </Row>
            <Row clickable={() => actions().shareLink()}>
              <Row.Icon icon="link" noBackground />
              <Row.Title>{i18n('ShareLink')}</Row.Title>
            </Row>
          </>
        )}
      </Show>
    </Section>
  ), options.middleware);
}
