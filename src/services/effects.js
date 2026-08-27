const SOUND_PREFERENCE_KEY = "googlefeud.soundEnabled.v1";
const EFFECTS_VOLUME_KEY = "googlefeud.effectsVolume.v1";
const MUSIC_VOLUME_KEY = "googlefeud.musicVolume.v1";
const LEGACY_KEYS = {
  sound: "googlefued.soundEnabled.v1",
  effects: "googlefued.effectsVolume.v1",
  music: "googlefued.musicVolume.v1"
};

const DEFAULT_EFFECTS_VOLUME = 1;
const DEFAULT_MUSIC_VOLUME = 0.34;
const THEME_BEAT_SECONDS = 0.42;
const THEME_LOOP_BEATS = 16;
const THEME_LOOP_SECONDS = THEME_BEAT_SECONDS * THEME_LOOP_BEATS;

// An original, syncopated game-show thinking cue. The rising triangle notes,
// soft bass pulse, and bell accents evoke a classic quiz-show atmosphere
// without reproducing another program's melody.
const THINKING_MELODY = Object.freeze([
  [0, 293.66, 0.58],
  [1, 392.0, 0.42],
  [2, 349.23, 0.62],
  [3.25, 440.0, 0.36],
  [4, 329.63, 0.58],
  [5.5, 493.88, 0.36],
  [6.25, 440.0, 0.7],
  [8, 261.63, 0.58],
  [9, 349.23, 0.42],
  [10.25, 415.3, 0.46],
  [11, 392.0, 0.78],
  [12.5, 329.63, 0.46],
  [13.5, 293.66, 0.46],
  [14.5, 349.23, 0.82]
]);
const THINKING_BASS = Object.freeze([
  [0, 146.83],
  [4, 130.81],
  [8, 164.81],
  [12, 110.0]
]);

let audioContext = null;
let masterBus = null;
let effectsBus = null;
let musicBus = null;
let soundEnabled = true;
let effectsVolume = DEFAULT_EFFECTS_VOLUME;
let musicVolume = DEFAULT_MUSIC_VOLUME;
let backgroundRequested = false;
let musicLoopTimer = null;
const activeMusicNodes = new Set();

function clampVolume(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function readPreference(currentKey, legacyKey) {
  const current = localStorage.getItem(currentKey);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) {
    localStorage.setItem(currentKey, legacy);
    localStorage.removeItem(legacyKey);
  }
  return legacy;
}

try {
  soundEnabled = readPreference(SOUND_PREFERENCE_KEY, LEGACY_KEYS.sound) !== "false";
  effectsVolume = clampVolume(
    readPreference(EFFECTS_VOLUME_KEY, LEGACY_KEYS.effects),
    DEFAULT_EFFECTS_VOLUME
  );
  musicVolume = clampVolume(
    readPreference(MUSIC_VOLUME_KEY, LEGACY_KEYS.music),
    DEFAULT_MUSIC_VOLUME
  );
} catch {
  soundEnabled = true;
  effectsVolume = DEFAULT_EFFECTS_VOLUME;
  musicVolume = DEFAULT_MUSIC_VOLUME;
}

function applyMix() {
  if (masterBus) masterBus.gain.value = soundEnabled ? 1 : 0;
  if (effectsBus) effectsBus.gain.value = effectsVolume;
  if (musicBus) musicBus.gain.value = musicVolume;
}

function context() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioContext = new AudioContext();
      masterBus = audioContext.createGain();
      effectsBus = audioContext.createGain();
      musicBus = audioContext.createGain();
      effectsBus.connect(masterBus);
      musicBus.connect(masterBus);
      masterBus.connect(audioContext.destination);
      applyMix();
    }
  }
  return audioContext;
}

function scheduleTone(frequency, delay = 0, duration = 0.12, options = {}) {
  if (!soundEnabled) return null;
  const ctx = context();
  if (!ctx || ctx.state !== "running") return null;

  const start = options.startAt ?? ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.volume || 0.09, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(options.bus === "music" ? musicBus : effectsBus);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);

  if (options.trackMusic) {
    activeMusicNodes.add(oscillator);
    oscillator.addEventListener("ended", () => activeMusicNodes.delete(oscillator), { once: true });
  }
  return oscillator;
}

function tone(frequency, delay = 0, duration = 0.12, options = {}) {
  return scheduleTone(frequency, delay, duration, { ...options, bus: "effects" });
}

function chord(notes, delay, duration, volume = 0.055) {
  notes.forEach((note) => tone(note, delay, duration, { type: "triangle", volume }));
}

function stopMusicLoop() {
  clearTimeout(musicLoopTimer);
  musicLoopTimer = null;
  const ctx = audioContext;
  for (const oscillator of activeMusicNodes) {
    try {
      oscillator.stop(ctx?.currentTime || 0);
    } catch {
      // The oscillator may already have completed naturally.
    }
  }
  activeMusicNodes.clear();
}

function scheduleThemePhrase(loop = false) {
  const ctx = context();
  if (!soundEnabled || musicVolume <= 0 || !ctx || ctx.state !== "running") return;
  const phraseStart = ctx.currentTime + 0.04;

  THINKING_BASS.forEach(([beat, frequency]) => {
    scheduleTone(frequency, 0, THEME_BEAT_SECONDS * 2.65, {
      startAt: phraseStart + beat * THEME_BEAT_SECONDS,
      type: "sine",
      volume: 0.032,
      bus: "music",
      trackMusic: true
    });
  });
  THINKING_MELODY.forEach(([beat, frequency, beatsLong], index) => {
    const startAt = phraseStart + beat * THEME_BEAT_SECONDS;
    scheduleTone(frequency, 0, beatsLong * THEME_BEAT_SECONDS, {
      startAt,
      type: "triangle",
      volume: 0.048,
      bus: "music",
      trackMusic: true
    });
    if (index % 4 === 1) {
      scheduleTone(frequency * 2, 0, 0.13, {
        startAt: startAt + 0.025,
        type: "sine",
        volume: 0.018,
        bus: "music",
        trackMusic: true
      });
    }
  });

  if (loop) {
    musicLoopTimer = setTimeout(() => {
      musicLoopTimer = null;
      if (backgroundRequested && soundEnabled && musicVolume > 0) scheduleThemePhrase(true);
    }, Math.max(100, (THEME_LOOP_SECONDS - 0.08) * 1000));
  }
}

function ensureMusicLoop() {
  if (!backgroundRequested || !soundEnabled || musicVolume <= 0 || musicLoopTimer) return;
  scheduleThemePhrase(true);
}

function storeVolume(key, legacyKey, value) {
  try {
    localStorage.setItem(key, String(value));
    localStorage.removeItem(legacyKey);
  } catch {
    // The mix remains active for this visit when browser storage is unavailable.
  }
}

export const soundEffects = {
  get enabled() {
    return soundEnabled;
  },

  get effectsVolume() {
    return effectsVolume;
  },

  get musicVolume() {
    return musicVolume;
  },

  async unlock() {
    const ctx = context();
    if (ctx?.state === "suspended") await ctx.resume().catch(() => {});
    ensureMusicLoop();
  },

  toggle() {
    soundEnabled = !soundEnabled;
    try {
      localStorage.setItem(SOUND_PREFERENCE_KEY, String(soundEnabled));
      localStorage.removeItem(LEGACY_KEYS.sound);
    } catch {
      // Sound still works for this visit when browser storage is unavailable.
    }
    applyMix();
    if (soundEnabled) {
      this.unlock().then(() => {
        tone(660, 0, 0.07, { type: "sine", volume: 0.07 });
        tone(880, 0.07, 0.1, { type: "sine", volume: 0.08 });
        ensureMusicLoop();
      });
    } else {
      stopMusicLoop();
    }
    return soundEnabled;
  },

  setEffectsVolume(value) {
    effectsVolume = clampVolume(value, DEFAULT_EFFECTS_VOLUME);
    storeVolume(EFFECTS_VOLUME_KEY, LEGACY_KEYS.effects, effectsVolume);
    applyMix();
    return effectsVolume;
  },

  setMusicVolume(value) {
    musicVolume = clampVolume(value, DEFAULT_MUSIC_VOLUME);
    storeVolume(MUSIC_VOLUME_KEY, LEGACY_KEYS.music, musicVolume);
    applyMix();
    if (musicVolume <= 0) stopMusicLoop();
    else ensureMusicLoop();
    return musicVolume;
  },

  syncBackgroundMusic(shouldPlay) {
    backgroundRequested = Boolean(shouldPlay);
    if (backgroundRequested) ensureMusicLoop();
    else stopMusicLoop();
  },

  previewTheme() {
    this.unlock().then(() => {
      if (backgroundRequested) ensureMusicLoop();
      else scheduleThemePhrase(false);
    });
  },

  previewEffect() {
    this.unlock().then(() => {
      tone(523, 0, 0.08, { type: "sine", volume: 0.06 });
      tone(784, 0.08, 0.15, { type: "triangle", volume: 0.08 });
    });
  },

  lockIn() {
    tone(392, 0, 0.08, { type: "square", volume: 0.045 });
    tone(587, 0.08, 0.1, { type: "triangle", volume: 0.075 });
    tone(784, 0.17, 0.16, { type: "triangle", volume: 0.09 });
  },

  reveal() {
    [330, 392, 494, 659].forEach((note, index) =>
      tone(note, index * 0.085, 0.16, { type: "triangle", volume: 0.065 })
    );
  },

  score(points) {
    if (Number(points) <= 0) {
      tone(165, 0, 0.22, { type: "sawtooth", volume: 0.045, endFrequency: 110 });
      tone(116, 0.1, 0.28, { type: "square", volume: 0.035, endFrequency: 82 });
      return;
    }
    [523, 659, 784].forEach((note, index) =>
      tone(note, index * 0.075, 0.18, { type: "sine", volume: 0.075 })
    );
  },

  roundWin() {
    [392, 523, 659, 784].forEach((note, index) =>
      tone(note, index * 0.09, 0.24, { type: "triangle", volume: 0.075 })
    );
    chord([523, 659, 784], 0.42, 0.55, 0.05);
  },

  finale() {
    [262, 330, 392, 523, 659, 784].forEach((note, index) =>
      tone(note, index * 0.09, 0.28, { type: "triangle", volume: 0.068 })
    );
    chord([523, 659, 784, 1047], 0.62, 0.9, 0.045);
  }
};
