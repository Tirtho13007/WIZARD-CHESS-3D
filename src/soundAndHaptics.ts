// Web Audio API Synthesized Cinematic Sound Engine & Haptic Feedback for WIZARD CHESS 3D

export interface AudioHapticSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0 to 100
  hapticsEnabled: boolean;
}

const STORAGE_KEY = 'wizard_chess_3d_audio_settings_v1';

class SoundAndHapticsManager {
  private ctx: AudioContext | null = null;
  private settings: AudioHapticSettings = {
    soundEnabled: true,
    soundVolume: 85,
    hapticsEnabled: true,
  };

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = {
          soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
          soundVolume: typeof parsed.soundVolume === 'number' ? parsed.soundVolume : 85,
          hapticsEnabled: typeof parsed.hapticsEnabled === 'boolean' ? parsed.hapticsEnabled : true,
        };
      }
    } catch {
      // ignore storage errors
    }
  }

  public getSettings(): AudioHapticSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AudioHapticSettings>): AudioHapticSettings {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore storage errors
    }
    return this.getSettings();
  }

  private ensureContext(): AudioContext | null {
    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getMasterGain(ctx: AudioContext, scale = 1.0): GainNode {
    const gain = ctx.createGain();
    const vol = Math.max(0, Math.min(1, this.settings.soundVolume / 100)) * scale;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.connect(ctx.destination);
    return gain;
  }

  public vibrate(pattern: number | number[]) {
    if (!this.settings.hapticsEnabled) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // ignore on unsupported devices
    }
  }

  // 1. Crisp 3D Button Click
  public playButtonClick() {
    this.vibrate(12);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.35);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.045);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  // 2. Subtle Stone Piece Selection Tap
  public playPieceSelect() {
    this.vibrate(10);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.4);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.06);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  // 3. Heavy Carved Marble / Stone Piece Landing on Board
  public playPieceMove() {
    this.vibrate(24);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.65);

    // Deep stone altar thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.16);

    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.19);

    // Subtle stone friction scrape
    this.spawnNoiseBurst(ctx, master, now, 0.09, 650, 'bandpass', 0.28);
  }

  // 4. Melee Sword / Weapon Cleave Impact on Capture
  public playCaptureStrike() {
    this.vibrate([45, 20, 40]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.85);

    // Metallic blade ring (inharmonic FM clang)
    const freqs = [880, 1340, 2120, 2980];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.72, now + 0.24);

      g.gain.setValueAtTime(0.28 / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + 0.26);
    });

    // Sharp weapon slash transient
    this.spawnNoiseBurst(ctx, master, now, 0.12, 2400, 'highpass', 0.55);
  }

  // 5. Heavy Stone Statue Shatter Explosion (When Piece is Captured & Destroyed)
  public playStoneShatter() {
    this.vibrate([60, 25, 90, 30, 50]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.95);

    // 1) Deep seismic sub-bass impact boom
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.48);

    subGain.gain.setValueAtTime(1.0, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

    subOsc.connect(subGain);
    subGain.connect(master);
    subOsc.start(now);
    subOsc.stop(now + 0.55);

    // 2) Main stone fracture burst
    this.spawnNoiseBurst(ctx, master, now, 0.32, 950, 'lowpass', 0.85);

    // 3) Cascading falling stone shards hitting the marble floor
    const shardDelays = [0.06, 0.13, 0.19, 0.27, 0.35, 0.44];
    shardDelays.forEach((delay, i) => {
      const t = now + delay;
      const decay = 0.08 + (i % 2) * 0.04;
      const filterFreq = 1100 + ((i * 370) % 1400);
      this.spawnNoiseBurst(ctx, master, t, decay, filterFreq, 'bandpass', Math.max(0.15, 0.5 - i * 0.06));
    });
  }

  // 6. King in Check — Dramatic Ominous Warning Horn & Cathedral Bell Toll
  public playKingCheck() {
    this.vibrate([70, 45, 70]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.85);

    // Cathedral Warning Bell + Brass Minor Second/Fifth Tension Chord (D4, A4, F5)
    const notes = [293.66, 440.0, 698.46, 880.0];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx < 2 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + 0.75);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28 / (idx * 0.5 + 1), now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.82);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.85);
    });
  }

  // 7. Checkmate — Battle Victory Royal War-Horn Fanfare & Timpani Drums
  public playCheckmateVictory() {
    this.vibrate([80, 40, 80, 40, 180]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.95);

    // Initial King statue topple crash
    this.spawnNoiseBurst(ctx, master, now + 0.35, 0.35, 850, 'lowpass', 0.65);

    // Royal Brass Fanfare Progression (4 heroic battle chords)
    const fanfareChords = [
      { start: 0.0, dur: 0.28, freqs: [261.63, 329.63, 392.0, 523.25] },   // C Major
      { start: 0.28, dur: 0.28, freqs: [293.66, 369.99, 440.0, 587.33] },  // D Major
      { start: 0.56, dur: 0.32, freqs: [329.63, 415.3, 493.88, 659.25] },  // E Major
      { start: 0.88, dur: 1.35, freqs: [261.63, 392.0, 523.25, 659.25, 783.99, 1046.5] }, // Grand C5 Triumph
    ];

    for (const chord of fanfareChords) {
      const t0 = now + chord.start;
      const tEnd = t0 + chord.dur;

      // Deep timpani war drum hit on every chord change
      const drumOsc = ctx.createOscillator();
      const drumGain = ctx.createGain();
      drumOsc.type = 'sine';
      drumOsc.frequency.setValueAtTime(115, t0);
      drumOsc.frequency.exponentialRampToValueAtTime(38, t0 + 0.25);
      drumGain.gain.setValueAtTime(0.65, t0);
      drumGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      drumOsc.connect(drumGain);
      drumGain.connect(master);
      drumOsc.start(t0);
      drumOsc.stop(t0 + 0.3);

      for (const f of chord.freqs) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t0);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2400, t0);
        filter.frequency.exponentialRampToValueAtTime(1200, tEnd);

        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(0.16, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, tEnd);

        osc.connect(filter);
        filter.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(tEnd + 0.02);
      }
    }
  }

  // 8. Match Start Horn Cue
  public playMatchStart() {
    this.vibrate([30, 25, 50]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.75);
    const notes = [261.63, 392.0, 523.25];
    notes.forEach((f, idx) => {
      const t0 = now + idx * 0.09;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(0.32, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.48);
    });
  }

  // 9. Unity Reward Unlocked Chime
  public playRewardUnlocked() {
    this.vibrate([25, 30, 55]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = this.getMasterGain(ctx, 0.65);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      const t0 = now + idx * 0.07;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.3, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.35);
    });
  }

  private spawnNoiseBurst(
    ctx: AudioContext,
    destination: AudioNode,
    startTime: number,
    duration: number,
    filterFreq: number,
    filterType: BiquadFilterType,
    peakGain: number
  ) {
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sampleCount, 1.4);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }
}

export const soundAndHaptics = new SoundAndHapticsManager();

if (typeof window !== 'undefined') {
  (window as unknown as { wizardChessAudio?: SoundAndHapticsManager }).wizardChessAudio =
    soundAndHaptics;
}
