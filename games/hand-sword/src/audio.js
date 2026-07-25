import * as Tone from 'tone';

// ---------- TONE.JS AUDIO SYSTEM ----------

// Tempo is intrinsic to the track, not difficulty — a cover needs to run
// at (close to) its real-world BPM to actually sound like the song, and
// speeding up something as melodic as "Sweet Child O' Mine" to a "hard"
// tempo just makes it stop sounding like the song. Difficulty is likewise
// a property of the track (theme.difficulty below), not a separate player
// choice — it controls spawn density (see drumPattern.mediumFill / 'hard'
// below), and a track's own difficulty is already implied by its tempo and
// arrangement, so a second independent knob was redundant.
export const DEFAULT_BPM = 128;

// A round now has a fixed length (measured in beats, not wall-clock time)
// so faster/slower tracks naturally run for different wall-clock lengths
// without needing a separate per-track duration.
export const TRACK_LENGTH_BEATS = 128; // 32 measures

Tone.Transport.bpm.value = DEFAULT_BPM;
export let currentBPM = DEFAULT_BPM;
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
    difficulty: 'medium',
    bpm: 128,
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
    difficulty: 'hard',
    bpm: 150,
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
    difficulty: 'easy',
    bpm: 95,
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
    difficulty: 'hard',
    bpm: 170,
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
  },

  // Real-song-inspired tracks: chord progressions and basslines recreated
  // from the well-known originals' actual harmony, played on the same
  // synthesized instruments as the tracks above (no sampled audio).
  sweetchild: {
    name: "Sweet Child O' Mine",
    difficulty: 'medium',
    bpm: 125, // the real song's tempo — this riff is melodic, not fast
    kick: null, snare: null, hihat: null, bass: null, lead: null, pad: null,
    // D - C - G - D: the iconic riff progression, recreated in D major
    chordProgression: [
      [293.66, 369.99, 440.00], // D  (D4-F#4-A4)
      [261.63, 329.63, 392.00], // C  (C4-E4-G4)
      [196.00, 246.94, 293.66], // G  (G3-B3-D4)
      [293.66, 369.99, 440.00]  // D  (D4-F#4-A4)
    ],
    bassMelodies: [
      [36.71, 41.20, 46.25, 49.00],  // D:  D1-E1-F#1-G1
      [32.70, 36.71, 41.20, 43.65],  // C:  C1-D1-E1-F1
      [49.00, 55.00, 61.74, 65.41],  // G:  G1-A1-B1-C2
      [36.71, 41.20, 46.25, 49.00]   // D:  D1-E1-F#1-G1
    ],
    // Driving rock backbeat under the riff
    drumPattern: { kick: [0, 2], snare: [1, 3], hihat: [0, 1, 2, 3], mediumFill: [2] },
    // What actually makes this song recognizable isn't the backbeat, it's
    // the galloping 16th-note guitar riff running underneath it — a chord
    // by itself at 125bpm just sounds like a slow rock loop. riffShape is
    // one measure (16 sixteenth-note steps) of chord-tone degrees relative
    // to the current chord: 0=root, 1=mid note, 2=fifth, 3=root an octave
    // up, null=rest. Playing this continuously on the lead synth is what
    // makes the riff — and therefore the box rhythm below — feel fast even
    // though the transport is still at 125bpm.
    riffed: true,
    riffShape: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2]
  },
  sevennation: {
    name: 'Seven Nation Army',
    difficulty: 'hard',
    bpm: 124, // the real song's tempo
    kick: null, snare: null, hihat: null, bass: null, lead: null, pad: null,
    // Em - D - C - B: the famous descending riff, recreated as a chord loop
    chordProgression: [
      [164.81, 196.00, 246.94], // Em (E3-G3-B3)
      [146.83, 185.00, 220.00], // D  (D3-F#3-A3)
      [130.81, 164.81, 196.00], // C  (C3-E3-G3)
      [123.47, 146.83, 185.00]  // B  (B2-D3-F#3)
    ],
    bassMelodies: [
      [41.20, 41.20, 61.74, 41.20], // Em riff: E1-E1-B1-E1
      [36.71, 36.71, 55.00, 36.71], // D:       D1-D1-A1-D1
      [32.70, 32.70, 49.00, 32.70], // C:       C1-C1-G1-C1
      [30.87, 30.87, 46.25, 30.87]  // B:       B0-B0-F#1-B0
    ],
    // The iconic four-on-the-floor stomp, with claps answering on 2 & 4
    drumPattern: { kick: [0, 1, 2, 3], snare: [1, 3], hihat: [], mediumFill: [0, 2] },
    // The riff is punchier and more spaced out than a melodic run — mostly
    // 8th notes, root/fifth motion, with rests giving it that stomping gap
    // rather than a continuous run (see sweetchild's riffShape for the
    // format).
    riffed: true,
    riffShape: [0, null, 0, null, 2, null, 1, null, 0, null, 0, null, 2, null, 1, null]
  },
  billiejean: {
    name: 'Billie Jean',
    difficulty: 'medium',
    bpm: 117, // the real song's tempo
    kick: null, snare: null, hihat: null, bass: null, lead: null, pad: null,
    // F#m - E - D#m - C#: the descending bassline that drives the whole song
    chordProgression: [
      [185.00, 220.00, 277.18], // F#m (F#3-A3-C#4)
      [164.81, 207.65, 246.94], // E   (E3-G#3-B3)
      [155.56, 185.00, 233.08], // D#m (D#3-F#3-A#3)
      [138.59, 174.61, 207.65]  // C#  (C#3-F3-G#3)
    ],
    bassMelodies: [
      [46.25, 46.25, 69.30, 46.25], // F#m: F#1-F#1-C#2-F#1
      [41.20, 41.20, 61.74, 41.20], // E:   E1-E1-B1-E1
      [38.89, 38.89, 58.27, 38.89], // D#m: D#1-D#1-A#1-D#1
      [34.65, 34.65, 51.91, 34.65]  // C#:  C#1-C#1-G#1-C#1
    ],
    // Syncopated disco-pop groove: steady kick, hi-hats driving the swing
    drumPattern: { kick: [0, 2], snare: [1, 3], hihat: [0, 1, 2, 3], mediumFill: [1, 3] },
    // The famous rolling bassline, walking through chord tones with a rest
    // on every other 16th note for that "bouncing" groove (see sweetchild's
    // riffShape for the format).
    riffed: true,
    riffShape: [0, null, 2, 1, 0, null, 2, 1, 0, null, 2, 1, 0, null, 2, 1]
  }
};

export let currentTheme = 'synthwave';

export let currentChordIndex = 0;
export let currentChord = themes[currentTheme].chordProgression[0];
export let currentBeatInMeasure = 0;

// Sixteenth-note position (0-15) within the current measure, driven by the
// riff scheduler below — only meaningful for themes with riffed: true.
export let riffStep = 0;

// Initialize theme instruments
export function initTheme(themeName) {
  const theme = themes[themeName];

  // Dispose old instruments (and any effect chain a theme built, e.g. the
  // distortion nodes the rock covers below route their bass/lead through)
  ['kick', 'snare', 'hihat', 'bass', 'lead', 'pad'].forEach((key) => {
    if (theme[key] && theme[key].dispose) theme[key].dispose();
  });
  if (theme.effects) {
    theme.effects.forEach((fx) => fx.dispose());
    theme.effects = null;
  }

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
  else if (themeName === 'sweetchild') {
    theme.kick = new Tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 5, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.35, sustain: 0.02, release: 1 }
    }).toDestination();
    theme.snare = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.15, sustain: 0 }
    }).toDestination();
    theme.hihat = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0 }
    }).toDestination();
    // Overdriven guitar-style grit for the bass/lead riff
    const sweetchildDist = new Tone.Distortion({ distortion: 0.4, wet: 0.5 }).toDestination();
    theme.bass = new Tone.Synth({
      oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.4 }
    }).connect(sweetchildDist);
    theme.lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.6, sustain: 0.4, release: 0.8 }
    }).connect(sweetchildDist);
    theme.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' }, envelope: { attack: 0.6, decay: 0, sustain: 1, release: 1.5 }
    }).toDestination();
    theme.effects = [sweetchildDist];
  }
  else if (themeName === 'sevennation') {
    theme.kick = new Tone.MembraneSynth({
      pitchDecay: 0.03, octaves: 6, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.6 }
    }).toDestination();
    theme.snare = new Tone.NoiseSynth({
      noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }
    }).toDestination();
    theme.hihat = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }
    }).toDestination();
    // Heavy fuzz to approximate the riff's octave-pedal bass tone
    const sevennationDist = new Tone.Distortion({ distortion: 0.7, wet: 0.7 }).toDestination();
    theme.bass = new Tone.FMSynth({
      harmonicity: 1, modulationIndex: 6, oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.4 }
    }).connect(sevennationDist);
    theme.lead = new Tone.PolySynth(Tone.FMSynth).connect(sevennationDist);
    theme.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' }, envelope: { attack: 0.5, decay: 0, sustain: 1, release: 1.2 }
    }).toDestination();
    theme.effects = [sevennationDist];
  }
  else if (themeName === 'billiejean') {
    theme.kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 5, oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.35, sustain: 0.01, release: 1 }
    }).toDestination();
    theme.snare = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.003, decay: 0.12, sustain: 0 }
    }).toDestination();
    theme.hihat = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 }
    }).toDestination();
    theme.bass = new Tone.Synth({
      oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.2 }
    }).toDestination();
    theme.lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.8, sustain: 0.3, release: 1 }
    }).toDestination();
    theme.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' }, envelope: { attack: 1, decay: 0, sustain: 1, release: 2 }
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

// melodyFreq is set on boxes spawned from a riffed track's melody grid (see
// setupBeatScheduler) — hitting one of those plays the actual riff note it
// was holding, so the song's melody comes from the player's own hits rather
// than an unrelated backing track. Boxes without one (every non-riffed
// track) fall back to the original chord-sparkle hit sound.
export function playHitSound(melodyFreq) {
  const theme = themes[currentTheme];
  const now = Tone.now();

  if (melodyFreq) {
    const note = Tone.Frequency(melodyFreq, 'hz').toNote();
    theme.lead.triggerAttackRelease(note, '8n', now, 0.6);
    return;
  }

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

  // Tempo belongs to the track, so switching tracks switches tempo too —
  // a cover actually plays at (close to) the real song's speed.
  updateBPM(themes[themeName].bpm);

  // Reset progression state so switching mid-song doesn't carry over an
  // index/chord that may not line up with the new track's progression
  currentChordIndex = 0;
  currentChord = themes[themeName].chordProgression[0];
  currentBeatInMeasure = 0;
  riffStep = 0;
}

// Beat scheduler - accepts callbacks for game logic
export function setupBeatScheduler(onBoxSpawn, onTrackEnd, onBeat) {
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
      // Riffed tracks get their box spawns from the melodic riff grid
      // below instead of the drum grid — spawning from both would double
      // up and no longer track what the player actually hears.
      if (!theme.riffed) shouldSpawnBox = true; // All difficulties spawn on kick
    }

    if (isSnare) {
      playSnare(time);
    }

    if (isHihat) {
      playHiHat(time);
    }

    if (onBeat) onBeat({ beatInMeasure, isKick, isSnare, isHihat });

    if (!theme.riffed) {
      if (theme.difficulty === 'medium' && drumPattern.mediumFill.includes(beatInMeasure)) {
        shouldSpawnBox = true;
      } else if (theme.difficulty === 'hard') {
        shouldSpawnBox = true;
      }
    }

    if (shouldSpawnBox) {
      onBoxSpawn();
    }

    beatCounter++;
  }, '4n'); // Schedule every quarter note

  // Riff scheduler — runs 4x faster than the beat grid above (sixteenth
  // notes) and only does anything for riffed: true tracks. Most of the
  // track's actual melodic riff notes are handed to a box instead of being
  // played immediately, so the melody comes from the player's own hits
  // (see onBoxSpawn(freq) below); the rest play quietly as backing so the
  // riff stays audible between hits. Spawns off this 16-step grid instead
  // of the quarter-note drum grid, so a dense riff (e.g. sweetchild's
  // galloping arpeggio) reads as faster gameplay even though the transport
  // tempo hasn't changed.
  Tone.Transport.scheduleRepeat((time) => {
    if (beatCounter >= TRACK_LENGTH_BEATS) return;

    const theme = themes[currentTheme];
    if (!theme.riffed) {
      riffStep = 0;
      return;
    }

    const degree = theme.riffShape[riffStep];
    if (degree !== null) {
      const freq = degree === 3 ? currentChord[0] * 2 : currentChord[degree];

      // Sample the riff grid at a coarser stride for the track's own
      // easier difficulty so it still gets a manageable box rate — same
      // idea as drumPattern.mediumFill above, just on a 16-step grid
      // instead of 4. At "hard" every note in the riff becomes a box, so
      // hitting a full measure cleanly plays the whole riff exactly as written.
      const stride = theme.difficulty === 'hard' ? 1 : theme.difficulty === 'medium' ? 2 : 4;

      if (riffStep % stride === 0) {
        // This note is carried by a box instead of playing automatically —
        // the player has to actually hit it (see playHitSound(melodyFreq)
        // in game-logic.js's destroyBox) for it to sound, so the riff is
        // performed by the player's hits rather than an autoplaying track.
        onBoxSpawn(freq);
      } else {
        // Notes that didn't become a box still play, quietly, as backing
        // texture so the riff stays audible even between hits.
        const note = Tone.Frequency(freq, 'hz').toNote();
        theme.lead.triggerAttackRelease(note, '16n', time, 0.15);
      }
    }

    riffStep = (riffStep + 1) % 16;
  }, '16n');
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
    riffStep = 0;

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
  riffStep = 0;
}

export function updateBPM(bpm) {
  currentBPM = bpm;
  Tone.Transport.bpm.value = bpm;
}

export function getCurrentBPM() {
  return currentBPM;
}
