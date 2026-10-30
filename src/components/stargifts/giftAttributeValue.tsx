/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Show} from 'solid-js';
import type {StarGiftAttributeRarity} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import Modes from '@config/modes';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import classNames from '@helpers/string/classNames';
import {TableButtonWithTooltip} from '@components/table';

import styles from '@components/stargifts/giftAttributeValue.module.scss';

const RARITY_TIERS: Record<Exclude<StarGiftAttributeRarity['_'], 'starGiftAttributeRarity'>, {langKey: LangPackKey, color: string}> = {
  starGiftAttributeRarityUncommon: {langKey: 'StarGiftRarityUncommon', color: styles.green},
  starGiftAttributeRarityRare: {langKey: 'StarGiftRarityRare', color: styles.blue},
  starGiftAttributeRarityEpic: {langKey: 'StarGiftRarityEpic', color: styles.violet},
  starGiftAttributeRarityLegendary: {langKey: 'StarGiftRarityLegendary', color: styles.gold}
};

/**
 * How rare a collectible's attribute is, in a pill beside its value: the share of the collectibles that have
 * it, which a click explains, or its tier in the tier's colour.
 */
export function GiftAttributeRarity(props: {rarity: StarGiftAttributeRarity}) {
  const rarity = props.rarity;
  if(rarity._ !== 'starGiftAttributeRarity') {
    const tier = RARITY_TIERS[rarity._];
    return (
      <TableButtonWithTooltip class={classNames(styles.rarity, tier.color, 'disable-hover')}>
        {i18n(tier.langKey)}
      </TableButtonWithTooltip>
    );
  }

  // * the server rounds a rarity below 0.1% down to zero
  const percent = rarity.permille > 0 ? `${rarity.permille / 10}%` : '< 0.1%';
  return (
    <TableButtonWithTooltip
      tooltipTextElement={i18n('StarGiftAttributeTooltip', [percent])}
      tooltipClass={styles.tooltip}
    >
      <span dir="ltr">{percent}</span>
    </TableButtonWithTooltip>
  );
}

/**
 * A collectible's attribute (model, backdrop, symbol) as a table value: its name, how rare it is when that is
 * known, and the name as a link when the caller has somewhere to take it.
 */
export function GiftAttributeValue(props: {name: string, rarity?: StarGiftAttributeRarity, onClick?: () => void}) {
  return (
    <div class={styles.value}>
      {props.onClick ? (
        <span
          class={styles.clickable}
          role="button"
          tabindex={Modes.a11y ? 0 : undefined}
          onClick={props.onClick}
          onKeyDown={buttonKeyDown}
          dir="auto"
        >
          {props.name}
        </span>
      ) : <span dir="auto">{props.name}</span>}
      <Show when={props.rarity} keyed>{(rarity) => <GiftAttributeRarity rarity={rarity} />}</Show>
    </div>
  );
}
