/**
 * Table Tennis Audio
 * Background music loop, a racket-hit effect, and a bouncy "boing" that
 * retriggers on every hit — built on Tone.js (same library used by
 * pong/hand-sword's audio.js elsewhere in this project).
 */

import * as Tone from 'tone';

const MAX_SPEED_FOR_AUDIO = 15; // matches physics.js's typical hit speed range, clamps pitch/volume scaling
const MIN_BOUNCE_SOUND_SPEED = 0.3; // below this, skip the sound — otherwise a ball settling near the floor machine-guns tiny bounce hits

// Simple arcade-y I-vi-IV-V loop (same familiar progression used elsewhere
// in this project), quiet and unobtrusive under the sound effects.
const MUSIC_PROGRESSION = [
  { chord: ['C4', 'E4', 'G4'], bass: 'C2' },
  { chord: ['A3', 'C4', 'E4'], bass: 'A1' },
  { chord: ['F3', 'A3', 'C4'], bass: 'F1' },
  { chord: ['G3', 'B3', 'D4'], bass: 'G1' }
];

let musicPad, musicBass;
let hitSynth;
let boingSynth;
let bounceSynth;
let netSynth;
let pointSynth;
let deuceSynth;
let gameOverSynth;

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

  // "Boing" — a sine that glides down in pitch then rebounds slightly before
  // settling, which is what actually reads as a cartoon spring/bounce rather
  // than a straight tone. Triggered fresh on every hit, not a continuous drone.
  boingSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.35, sustain: 0, release: 0.15 }
  }).toDestination();
  boingSynth.volume.value = -6;

  // Ball bouncing on the court — a plucked-membrane "pock" reads as a dull
  // impact on a hard surface, unlike the ringing tone the racket hit uses.
  bounceSynth = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }
  }).toDestination();
  bounceSynth.volume.value = -10;

  // Net hit — Karplus-Strong plucked-string model, since the net is
  // literally a string mesh; a synth tone wouldn't read as "strings".
  netSynth = new Tone.PluckSynth({
    attackNoise: 1,
    dampening: 3000,
    resonance: 0.85
  }).toDestination();
  netSynth.volume.value = -6;

  pointSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4 }
  }).toDestination();
  pointSynth.volume.value = -8;

  // Deuce — a suspended, unresolved interval to signal tension/high-stakes,
  // distinct from the resolved major/minor chords a normal point uses.
  deuceSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.6 }
  }).toDestination();
  deuceSynth.volume.value = -10;

  gameOverSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.3, release: 1 }
  }).toDestination();
  gameOverSynth.volume.value = -8;
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
 * Racket hit — pitch rises with the ball's post-hit speed.
 */
export function playHit(speed) {
  if (!isInitialized) return;

  const clamped = Math.min(speed, MAX_SPEED_FOR_AUDIO);
  const frequency = 220 + (clamped / MAX_SPEED_FOR_AUDIO) * 440;
  hitSynth.triggerAttackRelease(frequency, '16n');
}

/**
 * "Boing"/"tuing" bounce, layered under playHit() — harder hits start the
 * glide higher and a touch faster. Always fully resets (cancelScheduledValues)
 * before scheduling a new glide, so back-to-back hits can't leave a stale
 * ramp from the previous one still running underneath.
 */
export function playBoing(speed) {
  if (!isInitialized) return;

  const clamped = Math.min(speed, MAX_SPEED_FOR_AUDIO);
  const ratio = clamped / MAX_SPEED_FOR_AUDIO;
  const now = Tone.now();

  const startFreq = 500 + ratio * 350;
  const lowFreq = startFreq * 0.3;

  boingSynth.frequency.cancelScheduledValues(now);
  boingSynth.frequency.setValueAtTime(startFreq, now);
  boingSynth.frequency.exponentialRampToValueAtTime(lowFreq, now + 0.16);
  boingSynth.frequency.linearRampToValueAtTime(lowFreq * 1.2, now + 0.24); // slight rebound
  boingSynth.frequency.linearRampToValueAtTime(lowFreq, now + 0.32); // settle

  boingSynth.triggerAttackRelease(startFreq, 2, now);
}

/**
 * Ball bouncing on the court. impactSpeed is the vertical speed just before
 * the bounce (not the post-bounce speed) so it scales with how hard the
 * ball actually came down.
 */
export function playBounce(impactSpeed) {
  if (!isInitialized || impactSpeed < MIN_BOUNCE_SOUND_SPEED) return;

  const clamped = Math.min(impactSpeed, MAX_SPEED_FOR_AUDIO);
  const ratio = clamped / MAX_SPEED_FOR_AUDIO;
  const note = 80 + ratio * 40;
  bounceSynth.triggerAttackRelease(note, '100n');
}

/**
 * Ball hitting the net.
 */
export function playNetHit() {
  if (!isInitialized) return;
  netSynth.triggerAttackRelease('A3', '8n');
}

/**
 * Point awarded — distinct chord for the player vs the bot, same convention
 * used for playGameOver() below.
 */
export function playPoint(winner) {
  if (!isInitialized) return;
  const notes = winner === 'player' ? ['C5', 'E5', 'G5'] : ['C4', 'Eb4', 'G4'];
  pointSynth.triggerAttackRelease(notes, '8n');
}

/**
 * Deuce — an unresolved tritone instead of a normal point's resolved chord.
 */
export function playDeuce() {
  if (!isInitialized) return;
  deuceSynth.triggerAttackRelease(['C4', 'F#4'], '4n');
}

/**
 * Match win/lose, from the player's perspective.
 */
export function playGameOver(winner) {
  if (!isInitialized) return;
  const notes = winner === 'player' ? ['C4', 'E4', 'G4', 'C5'] : ['C4', 'A3', 'F3', 'C3'];
  gameOverSynth.triggerAttackRelease(notes, '2n');
}
