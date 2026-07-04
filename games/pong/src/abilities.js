/**
 * Pong Special Abilities
 * All 3 abilities are always available, each gated by its own cooldown and
 * triggered by its own FIXED finger-count pattern (see gesture-tracking.js):
 *   Paddle Boost -> hold up 5, then 4, then 3 fingers
 *   Slow-Mo      -> hold up 1, then 2 fingers
 *   Shield       -> hold up 3, then 4, then 5 fingers
 *
 * Every pattern is a CONSECUTIVE run (each step is ±1 from the last). That's
 * deliberate: going from e.g. 3 fingers to 5 physically requires passing
 * through 4 as you extend the next finger — that's a real, deliberate pause
 * in the motion, not just camera noise, so no hold-timer tuning avoids it.
 * Making 4 an intended step instead of a skipped one turns that pass-through
 * into a feature instead of a false trigger.
 *
 * Each pattern also starts with a different finger count, so there's no
 * prefix ambiguity between them — the first count alone tells you which
 * pattern, if any, is being attempted, so we can just accumulate and reset
 * on mismatch instead of needing a hold/wait window to disambiguate.
 *
 * The bot can't show fingers, so it periodically activates a random one of
 * its own ready (off-cooldown) abilities on a timer, keeping both sides on
 * equal footing.
 */

import { onGesture } from './gesture-tracking.js';
import { playAbilityActivate } from './audio.js';

export const ABILITY_TYPES = {
  paddleBoost: { name: 'Paddle Boost', pattern: [5, 4, 3], cooldown: 15000, duration: 6000 },
  slowMo: { name: 'Slow-Mo', pattern: [1, 2], cooldown: 20000, duration: 5000 },
  shield: { name: 'Shield', pattern: [3, 4, 5], cooldown: 25000, duration: 10000 } // duration = window to consume the save
};

const ABILITY_KEYS = Object.keys(ABILITY_TYPES);
const BOT_CHECK_MIN = 3000;
const BOT_CHECK_MAX = 8000;

const state = {
  player: { cooldowns: {}, active: null },
  bot: { cooldowns: {}, active: null, nextCheckAt: null }
};

let onActivateCallback = null;
let onCooldownChangeCallback = null;

let sequenceBuffer = [];

export function setupAbilities({ onActivate, onCooldownChange } = {}) {
  onActivateCallback = onActivate || null;
  onCooldownChangeCallback = onCooldownChange || null;

  onGesture((count) => handlePlayerGesture(count));

  resetAbilities();
}

function isPrefixOfSomePattern(sequence) {
  return ABILITY_KEYS.some((key) => {
    const p = ABILITY_TYPES[key].pattern;
    return p.length >= sequence.length && p.slice(0, sequence.length).every((step, i) => step === sequence[i]);
  });
}

function findAbilityForPattern(sequence) {
  return ABILITY_KEYS.find((key) => {
    const p = ABILITY_TYPES[key].pattern;
    return p.length === sequence.length && p.every((step, i) => step === sequence[i]);
  });
}

function handlePlayerGesture(count) {
  const candidate = [...sequenceBuffer, count];

  const type = findAbilityForPattern(candidate);
  if (type) {
    sequenceBuffer = [];
    tryActivate('player', type);
    return;
  }

  // Keep accumulating if this could still lead to some pattern; otherwise
  // restart fresh from just this count (it may itself begin a new pattern).
  sequenceBuffer = isPrefixOfSomePattern(candidate) ? candidate : [count];
}

function isOnCooldown(side, type) {
  const readyAt = state[side].cooldowns[type] || 0;
  return performance.now() < readyAt;
}

function tryActivate(side, type) {
  if (isOnCooldown(side, type)) return;
  activate(side, type);
}

function activate(side, type) {
  const now = performance.now();
  state[side].active = { type, until: now + ABILITY_TYPES[type].duration };
  state[side].cooldowns[type] = now + ABILITY_TYPES[type].cooldown;

  playAbilityActivate(type);
  if (onActivateCallback) onActivateCallback(side, type);
}

/**
 * Call once per frame. Advances active-effect expiry for both sides and
 * drives the bot's periodic auto-activation, then reports the player's
 * current cooldown state for the UI.
 */
export function updateAbilities() {
  const now = performance.now();

  for (const side of ['player', 'bot']) {
    const s = state[side];
    if (s.active && now >= s.active.until) {
      s.active = null;
    }
  }

  const bot = state.bot;
  if (bot.nextCheckAt !== null && now >= bot.nextCheckAt) {
    const ready = ABILITY_KEYS.filter((key) => !isOnCooldown('bot', key));
    if (ready.length > 0) {
      activate('bot', ready[Math.floor(Math.random() * ready.length)]);
    }
    bot.nextCheckAt = now + BOT_CHECK_MIN + Math.random() * (BOT_CHECK_MAX - BOT_CHECK_MIN);
  }

  if (onCooldownChangeCallback) {
    onCooldownChangeCallback(getCooldownSnapshot('player'));
  }
}

export function getCooldownSnapshot(side) {
  const now = performance.now();
  const snapshot = {};
  for (const key of ABILITY_KEYS) {
    const readyAt = state[side].cooldowns[key] || 0;
    snapshot[key] = Math.max(0, readyAt - now);
  }
  return snapshot;
}

export function isShieldActive(side) {
  return state[side].active?.type === 'shield';
}

export function consumeShield(side) {
  if (isShieldActive(side)) {
    state[side].active = null;
  }
}

export function isSlowMoActive(side) {
  return state[side].active?.type === 'slowMo';
}

export function isPaddleBoostActive(side) {
  return state[side].active?.type === 'paddleBoost';
}

export function getActiveAbility(side) {
  return state[side].active?.type || null;
}

export function resetAbilities() {
  state.player = { cooldowns: {}, active: null };
  state.bot = {
    cooldowns: {},
    active: null,
    nextCheckAt: performance.now() + BOT_CHECK_MIN + Math.random() * (BOT_CHECK_MAX - BOT_CHECK_MIN)
  };
  sequenceBuffer = [];

  if (onCooldownChangeCallback) onCooldownChangeCallback(getCooldownSnapshot('player'));
}
