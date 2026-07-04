/**
 * Pong Audio
 * Background music loop plus event/velocity-driven sound effects, built on
 * Tone.js (same library already used by hand-sword's audio.js).
 */

import * as Tone from 'tone';

const MAX_SPEED_FOR_AUDIO = 20; // matches physics.js MAX_SPEED, clamps pitch/volume scaling

// Simple arcade-y I-vi-IV-V loop (same familiar progression used elsewhere
// in this project), quiet and unobtrusive under the sound effects.
const MUSIC_PROGRESSION = [
  { chord: ['C4', 'E4', 'G4'], bass: 'C2' },
  { chord: ['A3', 'C4', 'E4'], bass: 'A1' },
  { chord: ['F3', 'A3', 'C4'], bass: 'F1' },
  { chord: ['G3', 'B3', 'D4'], bass: 'G1' }
];

const ABILITY_SOUND_NOTES = {
  paddleBoost: ['C5', 'E5'],
  slowMo: ['A3', 'C4'],
  shield: ['G4', 'B4', 'D5']
};

let musicPad, musicBass;
let hitSynth, wallSynth, missSynth, scoreSynth, abilitySynth, shieldSynth, serveSynth, gameOverSynth;
let airNoise, airFilter, airGain;

let isInitialized = false;
let isMusicPlaying = false;
let musicEventId = null;
let musicChordIndex = 0;

export function initAudio() {
  if (isInitialized) return;
  isInitialized = true;

  musicPad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.4, decay: 0.2, sustain: 0.5, release: 1 }
  }).toDestination();
  musicPad.volume.value = -18;

  musicBass = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.5 }
  }).toDestination();
  musicBass.volume.value = -14;

  hitSynth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 }
  }).toDestination();
  hitSynth.volume.value = -8;

  wallSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 }
  }).toDestination();
  wallSynth.volume.value = -12;

  missSynth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2 }
  }).toDestination();
  missSynth.volume.value = -10;

  scoreSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4 }
  }).toDestination();
  scoreSynth.volume.value = -8;

  abilitySynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'square' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 }
  }).toDestination();
  abilitySynth.volume.value = -10;

  shieldSynth = new Tone.MetalSynth({
    frequency: 150,
    envelope: { attack: 0.005, decay: 0.3, release: 0.1 },
    harmonicity: 4, modulationIndex: 16, resonance: 2000, octaves: 1
  }).toDestination();
  shieldSynth.volume.value = -12;

  serveSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 }
  }).toDestination();
  serveSynth.volume.value = -10;

  gameOverSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.3, release: 1 }
  }).toDestination();
  gameOverSynth.volume.value = -8;

  // Ball-in-flight whoosh: classic games do this with filtered noise, not a
  // pure tone — a bandpass sweep on white noise reads as "air", where a
  // sine drone just reads as a buzz/hum. Cutoff frequency + gain track the
  // ball's speed; silent (gain 0) until the ball is actually moving, see
  // updateGlideSound().
  airGain = new Tone.Gain(0).toDestination();
  airFilter = new Tone.Filter({ type: 'bandpass', frequency: 400, Q: 0.8 }).connect(airGain);
  airNoise = new Tone.Noise('white').connect(airFilter).start();
}

export async function startAudioContext() {
  await Tone.start();
}

export function startMusic() {
  if (isMusicPlaying) return;
  isMusicPlaying = true;
  musicChordIndex = 0;

  musicEventId = Tone.Transport.scheduleRepeat((time) => {
    const step = MUSIC_PROGRESSION[musicChordIndex % MUSIC_PROGRESSION.length];
    musicPad.triggerAttackRelease(step.chord, '2n', time, 0.2);
    musicBass.triggerAttackRelease(step.bass, '2n', time, 0.3);
    musicChordIndex++;
  }, '2n');

  Tone.Transport.start();
}

export function stopMusic() {
  if (!isMusicPlaying) return;
  isMusicPlaying = false;

  if (musicEventId !== null) {
    Tone.Transport.clear(musicEventId);
    musicEventId = null;
  }
  Tone.Transport.stop();
}

/**
 * Paddle hit — pitch rises with the ball's post-hit speed, like classic
 * pong's escalating hit sounds.
 */
export function playPaddleHit(speed) {
  const clamped = Math.min(speed, MAX_SPEED_FOR_AUDIO);
  const frequency = 220 + (clamped / MAX_SPEED_FOR_AUDIO) * 440;
  hitSynth.triggerAttackRelease(frequency, '16n');

  // Hard-reset the air-whoosh right at hit-time. A plain `.value = x`
  // assignment does NOT cancel the ramp still scheduled by the previous
  // frame's rampTo() call in updateGlideSound() below — the old automation
  // curve keeps running and silently overrides the assignment, which is why
  // the pitch used to just keep climbing across the whole game instead of
  // resetting per hit. cancelScheduledValues() + setValueAtTime() actually
  // clears it.
  if (isInitialized) {
    const ratio = clamped / MAX_SPEED_FOR_AUDIO;
    const now = Tone.now();

    airFilter.frequency.cancelScheduledValues(now);
    airFilter.frequency.setValueAtTime(300 + ratio * 3200, now);

    airGain.gain.cancelScheduledValues(now);
    airGain.gain.setValueAtTime(0.05 + ratio * 0.15, now);
  }
}

export function playWallBounce() {
  wallSynth.triggerAttackRelease(900, '32n');
}

/**
 * Per-frame follow-up for the glide drone kicked off by playPaddleHit() —
 * this is the continuous whoosh/engine sound while the ball is in flight.
 * Smoothly settles as the ball coasts and ramps to silence once the ball
 * isn't active (point over, not yet served, etc).
 */
export function updateGlideSound(speed, isActive) {
  if (!isInitialized) return;

  if (!isActive || speed < 0.05) {
    airGain.gain.rampTo(0, 0.15);
    return;
  }

  const clamped = Math.min(speed, MAX_SPEED_FOR_AUDIO);
  const ratio = clamped / MAX_SPEED_FOR_AUDIO;
  airFilter.frequency.rampTo(300 + ratio * 3200, 0.08);
  airGain.gain.rampTo(0.05 + ratio * 0.15, 0.08);
}

export function playMiss() {
  missSynth.triggerAttackRelease('A2', '8n');
}

export function playPointWin(winner) {
  const notes = winner === 'player' ? ['C5', 'E5', 'G5'] : ['C4', 'Eb4', 'G4'];
  scoreSynth.triggerAttackRelease(notes, '4n');
}

export function playAbilityActivate(type) {
  abilitySynth.triggerAttackRelease(ABILITY_SOUND_NOTES[type] || ['C5'], '8n');
}

export function playShieldSave() {
  shieldSynth.triggerAttackRelease('C3', '8n');
}

export function playServe() {
  serveSynth.triggerAttackRelease('E5', '16n');
}

export function playGameOver(winner) {
  const notes = winner === 'player' ? ['C4', 'E4', 'G4', 'C5'] : ['C4', 'A3', 'F3', 'C3'];
  gameOverSynth.triggerAttackRelease(notes, '2n');
}
