/**
 * Serve Challenge
 * Instead of pressing a button, the player serves by showing a sequence of
 * 3 random finger-count digits (1-5) in order, within a time limit. Digits
 * must be shown one at a time — the target only advances once the current
 * one is confirmed, so players can watch each box turn from grey (pending)
 * to green (confirmed) as they go. How many digits get confirmed before
 * time runs out scales the serve's power: 3/3 is full power, fewer is a
 * weaker serve — it never blocks the serve outright.
 */

const DIGIT_COUNT = 3;
const DIGIT_MIN = 1;
const DIGIT_MAX = 5;
const TIME_LIMIT_MS = 5000;
const HOLD_MS = 350; // how long a matching finger count must be held before it's confirmed, to filter out transient noise

let challenge = null; // { digits, digitDone, currentIndex, startTime, holdCount, holdStartTime }
let onResolve = null; // (powerRatio, completedCount) => void

export function setServeChallengeResolveCallback(callback) {
  onResolve = callback;
}

export function startServeChallenge() {
  challenge = {
    digits: Array.from(
      { length: DIGIT_COUNT },
      () => DIGIT_MIN + Math.floor(Math.random() * (DIGIT_MAX - DIGIT_MIN + 1))
    ),
    digitDone: new Array(DIGIT_COUNT).fill(false),
    currentIndex: 0,
    startTime: performance.now(),
    holdCount: null,
    holdStartTime: 0
  };
  return challenge.digits;
}

export function isServeChallengeActive() {
  return challenge !== null;
}

export function getServeChallengeState() {
  if (!challenge) return null;
  return {
    digits: challenge.digits,
    digitDone: challenge.digitDone,
    currentIndex: challenge.currentIndex,
    remainingMs: Math.max(0, TIME_LIMIT_MS - (performance.now() - challenge.startTime))
  };
}

/**
 * Call every frame while the challenge is active, feeding the live raw
 * finger count (0-5, or null if no hand visible). Resolves once all digits
 * are confirmed or the time limit runs out.
 */
export function updateServeChallenge(currentFingerCount) {
  if (!challenge) return;

  if (performance.now() - challenge.startTime >= TIME_LIMIT_MS) {
    resolve();
    return;
  }

  const targetDigit = challenge.digits[challenge.currentIndex];

  if (currentFingerCount !== targetDigit) {
    challenge.holdCount = null;
    return;
  }

  if (challenge.holdCount !== targetDigit) {
    challenge.holdCount = targetDigit;
    challenge.holdStartTime = performance.now();
    return;
  }

  if (performance.now() - challenge.holdStartTime >= HOLD_MS) {
    challenge.digitDone[challenge.currentIndex] = true;
    challenge.currentIndex++;
    challenge.holdCount = null;

    if (challenge.currentIndex >= DIGIT_COUNT) {
      resolve();
    }
  }
}

export function cancelServeChallenge() {
  challenge = null;
}

function resolve() {
  const completedCount = challenge.digitDone.filter(Boolean).length;
  const powerRatio = completedCount / DIGIT_COUNT;
  challenge = null;
  onResolve?.(powerRatio, completedCount);
}
