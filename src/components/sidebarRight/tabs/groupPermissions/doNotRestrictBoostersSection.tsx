import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {IconTsx} from '@components/iconTsx';
import RangeStepsSelector from '@components/rangeStepsSelectorTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import Animated from '@helpers/solid/animations';
import {i18n} from '@lib/langPack';
import {createEffect, createSignal, on, Show, untrack} from 'solid-js';
import {render} from 'solid-js/web';

type Value = number | undefined;

export default function createDoNotRestrictBoostersSection(props: {
  initialBoosts?: Value,
  onChange: (boosts: Value) => void,
  show: () => boolean
}) {
  const element = document.createElement('div');

  const dispose = render(() => {
    const [boosts, setBoosts] = createSignal<Value>(props.initialBoosts);

    createEffect(on(boosts, (boosts) => {
      props.onChange(boosts);
    }, {defer: true}));

    createEffect(() => {
      if(!props.show()) {
        setBoosts(undefined);
      }
    });

    const shouldAppear = untrack(() => !props.show());

    return (
      <Animated
        type="grow-height"
        appear={shouldAppear}
        mode="add-remove"
        noItemClass
      >
        <Show when={props.show()}>
          <Section
            caption={boosts() ? 'DoNotRestrictBoostersCaptionOn' : 'DoNotRestrictBoostersCaption'}
            class="overflow-hidden"
          >
            <Row>
              <Row.CheckboxFieldToggle>
                <CheckboxFieldTsx
                  checked={untrack(() => !!boosts())}
                  toggle
                  onChange={(value) => {
                    setBoosts(() => value ? 1 : undefined);
                  }}
                />
              </Row.CheckboxFieldToggle>
              <Row.Title>{i18n('DoNotRestrictBoosters')}</Row.Title>
            </Row>
            <Animated
              type="grow-height"
              appear={shouldAppear}
              mode="add-remove"
              noItemClass
            >
              <Show when={boosts()}>
                <div class="overflow-hidden">
                  <RangeStepsSelector
                    indexByValue={boosts()}
                    steps={
                      [1, 2, 3, 4, 5]
                      .map((value) => [
                        (
                          <>
                            <IconTsx icon={value === 1 ? 'boost' : 'boosts'} class="inline-icon" />
                            {value.toString()}
                          </>
                        ),
                        value
                      ])
                    }
                    onValue={(value) => {
                      setBoosts(value);
                    }}
                  />
                </div>
              </Show>
            </Animated>
          </Section>
        </Show>
      </Animated>
    );
  }, element);

  return {
    element,
    dispose
  };
}
