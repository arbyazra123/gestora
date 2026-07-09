import * as Tone from 'tone';

// ---------- TONE.JS AUDIO SYSTEM ----------

// Difficulty no longer exposes a free-form BPM slider — each preset bakes
// in its own fixed tempo, so "Track" + difficulty together determine both
// speed and spawn density.
export const DIFFICULTY_PRESETS = {
  easy: { bpm: 100 },
  medium: { bpm: 128 },
  hard: { bpm: 160 },
};

// A round now has a fixed length (measured in beats, not wall-clock time)
// so easier/slower difficulties naturally run longer without needing a
// separate per-difficulty duration.
export const TRACK_LENGTH_BEATS = 128; // 32 measures

Tone.Transport.bpm.value = DIFFICULTY_PRESETS.medium.bpm;
export let currentBPM = DIFFICULTY_PRESETS.medium.bpm;
export let isAudioPlaying = false;
export let beatCounter = 0;

// Each track has its own instrument timbres, chord progression, bass line,
// and drum pattern — these used to be one shared progression/pattern with
// just different synth timbres layered on top, so every track sounded like
// the same loop. drumPattern.mediumFill lists the extra beats (beyond kick)
// that spawn boxes at 'medium' difficulty; 'hard' always spawns every beat.
export const themes = {
  synthwave: {
    name: 'Midnight Drive',
    kick: null, snare: null, hihat: null, bass: null, lead: null, pad: null,
    // i - VI - III - VII in D minor: a melancholic, driving retro feel
    chordProgression: [
      [293.66, 349.23, 440.00], // Dm (D4-F4-A4)
      [233.08, 293.66, 349.23], // Bb (Bb3-D4-F4)
      [174.61, 220.00, 261.63], // F  (F3-A3-C4)
      [261.63, 329.63, 392.00]  // C  (C4-E4-G4)
    ],
    bassMelodies: [
      [36.71, 41.20, 43.65, 49.00],  // Dm: D1-E1-F1-G1
      [58.27, 65.41, 73.42, 82.41],  // Bb: Bb1-C2-D2-E2
      [43.65, 49.00, 55.00, 61.74],  // F:  F1-G1-A1-B1
      [65.41, 82.41, 98.00, 110.00]  // C:  C2-E2-G2-A2
    ],
    // Standard rock/pop backbeat: kick on 1 & 3, snare on 2 & 4
    drumPattern: { kick: [0, 2], snare: [1, 3], hihat: [0, 1, 2, 3], mediumFill: [1, 3] }
  },
  cyberpunk: {
    name: 'Chrome District',
    kick: null, snare: null, hihat: null, bass: null, lead: null, pad: null,
    // i - VI - III - VII in E minor: darker, driving
    chordProgression: [
      [164.81, 196.00, 246.94], // Em (E3-G3-B3)
      [261.63, 329.63, 392.00], // C  (C4-E4-G4)
      [196.00, 246.94, 293.66], // G  (G3-B3-D4)
      [146.83, 185.00, 220.00]  // D  (D3-F#3-A3)
    ],
    bassMelodies: [
      [41.20, 46.25, 49.00, 55.00],  // Em: E1-F#1-G1-A1
      [65.41, 73.42, 82.41, 92.50],  // C:  C2-D2-E2-F#2
      [49.00, 55.00, 61.74, 65.41],  // G:  G1-A1-B1-C2
      [73.42, 82.41, 92.50, 98.00]   // D:  D2-E2-F#2-G2
    ],
    // Syncopated industrial pulse: extra kick on beat 4
    drumPattern: { kick: [0, 2, 3], snare: [2], hihat: [0, 1, 2, 3], mediumFill: [] }
  },
  chillwave: {
    name: 'Ocean Haze',
    kick: null, snare: null, hihat: null, bass: null, lead: null, pad: null,
    // I - vi - ii - V in C major: warm, circulating chill loop
    chordProgression: [
      [261.63, 329.63, 392.00], // C  (C4-E4-G4)
      [220.00, 261.63, 329.63], // Am (A3-C4-E4)
      [146.83, 174.61, 220.00], // Dm (D3-F3-A3)
      [196.00, 246.94, 293.66]  // G  (G3-B3-D4)
    ],
    bassMelodies: [
      [65.41, 82.41, 98.00, 110.00], // C:  C2-E2-G2-A2
      [55.00, 61.74, 65.41, 73.42],  // Am: A1-B1-C2-D2
      [36.71, 41.20, 43.65, 49.00],  // Dm: D1-E1-F1-G1
      [49.00, 55.00, 61.74, 65.41]   // G:  G1-A1-B1-C2
    ],
    // Sparse and laid-back: one kick, hi-hat only on the off-beats
    drumPattern: { kick: [0], snare: [2], hihat: [1, 3], mediumFill: [2] }
  },
  dnb: {
    name: 'Breakneck',
    kick: null, snare: null, hihat: null, bass: null, lead: null, pad: null,
    // Original I - vi - IV - V progression, unchanged
    chordProgression: [
      [261.63, 329.63, 392.00], // C major (C-E-G)
      [220.00, 261.63, 329.63], // A minor (A-C-E)
      [174.61, 220.00, 261.63], // F major (F-A-C)
      [196.00, 246.94, 293.66]  // G major (G-B-D)
    ],
    bassMelodies: [
      [65.41, 82.41, 98.00, 110.00],
      [55.00, 61.74, 65.41, 73.42],
      [43.65, 49.00, 55.00, 61.74],
      [49.00, 55.00, 61.74, 65.41]
    ],
    // Original pattern, unchanged: kick 0/2, snare on 2, hi-hat every beat
    drumPattern: { kick: [0, 2], snare: [2], hihat: [0, 1, 2, 3], mediumFill: [1, 3] }
  }
};

export let currentTheme = 'synthwave';

export let currentChordIndex = 0;
export let currentChord = themes[currentTheme].chordProgression[0];
export let currentBeatInMeasure = 0;

// Initialize theme instruments
export function initTheme(themeName) {
  const theme = themes[themeName];

  // Dispose old instruments
  ['kick', 'snare', 'hihat', 'bass', 'lead', 'pad'].forEach((key) => {
    if (theme[key] && theme[key].dispose) theme[key].dispose();
  });

  if (themeName === 'synthwave') {
    theme.kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 6, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
    }).toDestination();
    theme.snare = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
    }).toDestination();
    theme.hihat = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 }
    }).toDestination();
    theme.bass = new Tone.Synth({
      oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5 }
    }).toDestination();
    theme.lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 1, sustain: 0.3, release: 1 }
    }).toDestination();
    theme.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' }, envelope: { attack: 0.8, decay: 0, sustain: 1, release: 2 }
    }).toDestination();
  }
  else if (themeName === 'cyberpunk') {
    theme.kick = new Tone.MembraneSynth({
      pitchDecay: 0.02, octaves: 8, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.8 }
    }).toDestination();
    theme.snare = new Tone.MetalSynth({
      frequency: 200, envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
    }).toDestination();
    theme.hihat = new Tone.MetalSynth({
      frequency: 300, envelope: { attack: 0.001, decay: 0.03, release: 0.01 },
      harmonicity: 8, modulationIndex: 2, resonance: 3000, octaves: 1
    }).toDestination();
    theme.bass = new Tone.FMSynth({
      harmonicity: 1.5, modulationIndex: 10, oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 }
    }).toDestination();
    theme.lead = new Tone.PolySynth(Tone.FMSynth).toDestination();
    theme.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' }, envelope: { attack: 1, decay: 0, sustain: 1, release: 2 }
    }).toDestination();
  }
  else if (themeName === 'chillwave') {
    theme.kick = new Tone.MembraneSynth({
      pitchDecay: 0.08, octaves: 4, oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.6, sustain: 0.02, release: 2 }
    }).toDestination();
    theme.snare = new Tone.NoiseSynth({
      noise: { type: 'pink' }, envelope: { attack: 0.01, decay: 0.15, sustain: 0 }
    }).toDestination();
    theme.hihat = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0 }
    }).toDestination();
    theme.bass = new Tone.Synth({
      oscillator: { type: 'triangle' }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.5, release: 1 }
    }).toDestination();
    theme.lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.8, sustain: 0.4, release: 1.5 }
    }).toDestination();
    theme.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' }, envelope: { attack: 1.5, decay: 0, sustain: 1, release: 3 }
    }).toDestination();
  }
  else if (themeName === 'dnb') {
    theme.kick = new Tone.MembraneSynth({
      pitchDecay: 0.02, octaves: 10, oscillator: { type: 'sine' },
      envelope: { attack: 0.0001, decay: 0.2, sustain: 0, release: 0.5 }
    }).toDestination();
    theme.snare = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0 }
    }).toDestination();
    theme.hihat = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.0001, decay: 0.02, sustain: 0 }
    }).toDestination();
    theme.bass = new Tone.Synth({
      oscillator: { type: 'sawtooth' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0.2, release: 0.3 }
    }).toDestination();
    theme.lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.2, release: 0.5 }
    }).toDestination();
    theme.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' }, envelope: { attack: 0.5, decay: 0, sustain: 1, release: 1.5 }
    }).toDestination();
  }
}

// Initialize default theme
initTheme(currentTheme);

// Audio playback functions
export function playKick(time) {
  const theme = themes[currentTheme];
  theme.kick.triggerAttackRelease('C1', '8n', time);
}

export function playSnare(time) {
  const theme = themes[currentTheme];
  theme.snare.triggerAttackRelease('16n', time);
}

export function playHiHat(time) {
  const theme = themes[currentTheme];
  theme.hihat.triggerAttackRelease('32n', time);
}

export function playBass(time, frequency, duration) {
  const theme = themes[currentTheme];
  const note = Tone.Frequency(frequency, 'hz').toNote();
  theme.bass.triggerAttackRelease(note, duration, time);
}

export function playHitSound() {
  const theme = themes[currentTheme];
  const now = Tone.now();

  const notes = currentChord.map(freq => {
    const note = Tone.Frequency(freq, 'hz').toNote();
    return Tone.Frequency(note).transpose(24).toNote();
  });

  theme.lead.triggerAttackRelease(notes, '16n', now, 0.5);
}

export function playComboBreakSound() {
  const theme = themes[currentTheme];
  const now = Tone.now();

  theme.bass.triggerAttackRelease('E2', '8n', now);
  theme.bass.triggerAttackRelease('D2', '8n', now + 0.1);
  theme.bass.triggerAttackRelease('C2', '8n', now + 0.2);
}

export function playChord(time, frequencies, duration = 1) {
  const theme = themes[currentTheme];
  const notes = frequencies.map(freq => Tone.Frequency(freq, 'hz').toNote());
  theme.pad.triggerAttackRelease(notes, duration, time, 0.15);
}

export function setTheme(themeName) {
  currentTheme = themeName;
  initTheme(themeName);

  // Reset progression state so switching mid-song doesn't carry over an
  // index/chord that may not line up with the new track's progression
  currentChordIndex = 0;
  currentChord = themes[themeName].chordProgression[0];
  currentBeatInMeasure = 0;
}

// Beat scheduler - accepts callbacks for game logic
export function setupBeatScheduler(onBoxSpawn, getCurrentDifficulty, onTrackEnd, onBeat) {
  Tone.Transport.scheduleRepeat((time) => {
    if (beatCounter >= TRACK_LENGTH_BEATS) {
      if (onTrackEnd) onTrackEnd();
      return;
    }

    const theme = themes[currentTheme];
    const { chordProgression, bassMelodies, drumPattern } = theme;

    const beatNumber = beatCounter;
    const beatInMeasure = beatNumber % 4;
    const beatInterval = 60 / currentBPM;

    // Play chord every 4 beats (one chord per measure)
    if (beatNumber % 4 === 0) {
      currentChord = chordProgression[currentChordIndex % chordProgression.length];
      playChord(time, currentChord, beatInterval * 4);
      currentChordIndex = (currentChordIndex + 1) % chordProgression.length;
    }

    // Get current bass melody and note within pattern
    const currentBassPatternIndex = Math.floor(beatNumber / 4) % bassMelodies.length;
    const currentBassMelody = bassMelodies[currentBassPatternIndex];
    const bassNote = currentBassMelody[beatInMeasure];

    // Update global beat position for hit sounds
    currentBeatInMeasure = beatInMeasure;

    // Bass plays on every beat
    playBass(time, bassNote, beatInterval * 2);

    // Drum pattern with difficulty-based box spawning, driven by the
    // current track's own pattern rather than one hardcoded shared pattern
    let shouldSpawnBox = false;
    const isKick = drumPattern.kick.includes(beatInMeasure);
    const isSnare = drumPattern.snare.includes(beatInMeasure);
    const isHihat = drumPattern.hihat.includes(beatInMeasure);

    if (isKick) {
      playKick(time);
      shouldSpawnBox = true; // All difficulties spawn on kick
    }

    if (isSnare) {
      playSnare(time);
    }

    if (isHihat) {
      playHiHat(time);
    }

    if (onBeat) onBeat({ beatInMeasure, isKick, isSnare, isHihat });

    const difficulty = getCurrentDifficulty();
    if (difficulty === 'medium' && drumPattern.mediumFill.includes(beatInMeasure)) {
      shouldSpawnBox = true;
    } else if (difficulty === 'hard') {
      shouldSpawnBox = true;
    }

    if (shouldSpawnBox) {
      onBoxSpawn();
    }

    beatCounter++;
  }, '4n'); // Schedule every quarter note
}

// Audio control functions

/**
 * Unlock the browser's audio context. Must be called synchronously within
 * a user-gesture call chain (e.g. a click handler) — browsers only honor
 * the autoplay-gesture exemption for a short time after the original
 * gesture, so this is split from beginPlayback() below, which multiplayer
 * mode defers to a server-synchronized start time after a network round-trip.
 */
export async function unlockAudioContext() {
  await Tone.start();
}

/**
 * Start the beat/transport clock. Not gesture-gated, safe to call later
 * (e.g. from a setTimeout once a synchronized start epoch arrives).
 */
export function beginPlayback() {
  if (!isAudioPlaying) {
    isAudioPlaying = true;
    beatCounter = 0;
    currentChordIndex = 0;
    currentChord = themes[currentTheme].chordProgression[0];
    currentBeatInMeasure = 0;

    Tone.Transport.start();
  }
}

export async function startAudio() {
  await unlockAudioContext();
  beginPlayback();
}

export function pauseAudio() {
  isAudioPlaying = false;
  Tone.Transport.pause();
}

export function stopAudio() {
  isAudioPlaying = false;
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  beatCounter = 0;
  currentChordIndex = 0;
  currentChord = themes[currentTheme].chordProgression[0];
  currentBeatInMeasure = 0;
}

export function updateBPM(bpm) {
  currentBPM = bpm;
  Tone.Transport.bpm.value = bpm;
}

export function getCurrentBPM() {
  return currentBPM;
}
