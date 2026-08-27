const SOUND_PREFERENCE_KEY = "googlefeud.soundEnabled.v1";
const LEGACY_SOUND_PREFERENCE_KEY = "googlefued.soundEnabled.v1";

let audioContext = null;
let soundEnabled = true;
try {
  const storedPreference = localStorage.getItem(SOUND_PREFERENCE_KEY);
  const legacyPreference = localStorage.getItem(LEGACY_SOUND_PREFERENCE_KEY);
  const preference = storedPreference ?? legacyPreference;
  soundEnabled = preference !== "false";
  if (storedPreference === null && legacyPreference !== null) {
    localStorage.setItem(SOUND_PREFERENCE_KEY, legacyPreference);
    localStorage.removeItem(LEGACY_SOUND_PREFERENCE_KEY);
  }
} catch {
  soundEnabled = true;
}

function context() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioContext = new AudioContext();
  }
  return audioContext;
}

function tone(frequency, delay = 0, duration = 0.12, options = {}) {
  if (!soundEnabled) return;
  const ctx = context();
  if (!ctx || ctx.state !== "running") return;

  const start = ctx.currentTime + delay;
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
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function chord(notes, delay, duration, volume = 0.055) {
  notes.forEach((note) => tone(note, delay, duration, { type: "triangle", volume }));
}

export const soundEffects = {
  get enabled() {
    return soundEnabled;
  },

  async unlock() {
    const ctx = context();
    if (ctx?.state === "suspended") await ctx.resume().catch(() => {});
  },

  toggle() {
    soundEnabled = !soundEnabled;
    try {
      localStorage.setItem(SOUND_PREFERENCE_KEY, String(soundEnabled));
      localStorage.removeItem(LEGACY_SOUND_PREFERENCE_KEY);
    } catch {
      // Sound still works for this visit when browser storage is unavailable.
    }
    if (soundEnabled) {
      this.unlock();
      tone(660, 0, 0.07, { type: "sine", volume: 0.07 });
      tone(880, 0.07, 0.1, { type: "sine", volume: 0.08 });
    }
    return soundEnabled;
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
