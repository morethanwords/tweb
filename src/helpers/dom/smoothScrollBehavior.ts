import liteMode from '@helpers/liteMode';

/** A native scroll glides only with full animations - below them it jumps */
export default function smoothScrollBehavior(): ScrollBehavior {
  return liteMode.isAvailable('motion') ? 'smooth' : 'auto';
}
