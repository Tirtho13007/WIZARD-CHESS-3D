// ============================================================================
// ARCANE CHESS 3D — REALISTIC WEB AUDIO SYNTHESIZER & ANDROID HAPTICS ENGINE
// Includes:
//  - Faint Gregorian Chanting & Gothic Cathedral Echoes background loop
//    that dynamically scales with volume settings during matches
//  - Visceral Thunderbolt ("Bojropat") + Stone Statue Shatter ("Venge Fela")
//    piece capture sound effects
//  - Urgent Royal Check Alert sound ("Raja Check")
//  - Epic Battle Warhorn ("Juddhe Jitar Horn") on Checkmate Victory
//  - Somber Fallen Kingdom Defeat sound when losing vs AI
//  - Solemn Sanctum Truce sound on Stalemate / Draw
// ============================================================================

export interface AudioHapticSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0 to 100
  hapticsEnabled: boolean;
}

const STORAGE_KEY = 'wizard_chess_3d_audio_settings_v1';

const DEFAULT_SETTINGS: AudioHapticSettings = {
  soundEnabled: true,
  soundVolume: 90,
  hapticsEnabled: true,
};

// Authentic D-Dorian Gregorian chant modal phrases (frequencies in Hz, baritone/tenor register)
const GREGORIAN_CHANT_PHRASES: number[][] = [
  // Phrase I: Solemn Kyrie opening (D3 - E3 - F3 - E3 - D3)
  [146.83, 164.81, 174.61, 164.81, 146.83],
  // Phrase II: Rising Sanctus arch (F3 - G3 - A3 - G3 - F3)
  [174.61, 196.0, 220.0, 196.0, 174.61],
  // Phrase III: High Cathedral Vault response (A3 - C4 - A3 - G3 - F3)
  [220.0, 261.63, 220.0, 196.0, 174.61],
  // Phrase IV: Dies Irae modal cadence (F3 - E3 - D3 - C3 - D3)
  [174.61, 164.81, 146.83, 130.81, 146.83],
];

// Male choir vowel formant definitions (F1, F2, F3 in Hz) for "Oh", "Ah", "Oo"
const CHOIR_VOWEL_FORMANTS: Array<[number, number, number]> = [
  [450, 850, 2450], // "Oh" (Sanctus / Dominus)
  [620, 1080, 2520], // "Ah" (Amen / Gloria)
  [380, 740, 2360], // "Oo" (Kyrie / Miserere)
];

class SoundAndHapticsManager {
  private ctx: AudioContext | null = null;
  private settings: AudioHapticSettings;
  private listeners: Set<(s: AudioHapticSettings) => void> = new Set();

  // Gothic Cathedral & Gregorian Chant Ambience state
  private matchAmbienceRequested = false;
  private ambiencePausedForOverlay = false;
  private ambienceMasterGain: GainNode | null = null;
  private cathedralEchoInput: GainNode | null = null;
  private ambiencePhraseTimer: number | null = null;
  private ambiencePhraseIndex = 0;
  private ambienceDroneStop: (() => void) | null = null;

  constructor() {
    this.settings = this.loadSettings();
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.shouldPlayAmbience()) {
          this.ensureCathedralAmbienceGraph();
        }
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  private loadSettings(): AudioHapticSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          soundEnabled:
            typeof parsed.soundEnabled === 'boolean'
              ? parsed.soundEnabled
              : DEFAULT_SETTINGS.soundEnabled,
          soundVolume:
            typeof parsed.soundVolume === 'number'
              ? Math.max(0, Math.min(100, parsed.soundVolume))
              : DEFAULT_SETTINGS.soundVolume,
          hapticsEnabled:
            typeof parsed.hapticsEnabled === 'boolean'
              ? parsed.hapticsEnabled
              : DEFAULT_SETTINGS.hapticsEnabled,
        };
      }
    } catch {
      // Ignore storage errors
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage errors
    }
    this.listeners.forEach((cb) => cb({ ...this.settings }));
  }

  public getSettings(): AudioHapticSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AudioHapticSettings>): AudioHapticSettings {
    this.settings = {
      ...this.settings,
      ...partial,
      soundVolume:
        typeof partial.soundVolume === 'number'
          ? Math.max(0, Math.min(100, partial.soundVolume))
          : this.settings.soundVolume,
    };
    this.saveSettings();
    this.syncCathedralAmbience();
    return this.getSettings();
  }

  public subscribe(cb: (s: AudioHapticSettings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private getContext(): AudioContext | null {
    if (!this.settings.soundEnabled || this.settings.soundVolume <= 0) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getGain(): number {
    if (!this.settings.soundEnabled) return 0;
    return (this.settings.soundVolume / 100) * 0.9;
  }

  // ==========================================================================
  // GOTHIC CATHEDRAL & FAINT GREGORIAN CHANTING BACKGROUND LOOP
  // Dynamically scales with volume settings & enhances match atmosphere
  // ==========================================================================
  private getTargetAmbienceGain(): number {
    if (!this.shouldPlayAmbience()) return 0;
    const normalizedVol = Math.max(0, Math.min(100, this.settings.soundVolume)) / 100;
    // Boosted from 0.24 to 0.46 (~90% stronger background music presence)
    return normalizedVol * 0.46;
  }

  private shouldPlayAmbience(): boolean {
    return (
      this.matchAmbienceRequested &&
      !this.ambiencePausedForOverlay &&
      this.settings.soundEnabled &&
      this.settings.soundVolume > 0
    );
  }

  public setMatchAmbienceActive(active: boolean): void {
    this.matchAmbienceRequested = active;
    this.syncCathedralAmbience();
  }

  public setAmbienceOverlayPaused(paused: boolean): void {
    this.ambiencePausedForOverlay = paused;
    this.syncCathedralAmbience();
  }

  private syncCathedralAmbience(): void {
    if (!this.shouldPlayAmbience()) {
      if (this.ambienceMasterGain && this.ctx) {
        try {
          const now = this.ctx.currentTime;
          this.ambienceMasterGain.gain.cancelScheduledValues(now);
          this.ambienceMasterGain.gain.setTargetAtTime(0.0001, now, 0.18);
        } catch {
          // Ignore audio graph errors
        }
      }
      this.stopAmbienceScheduler();
      return;
    }

    this.ensureCathedralAmbienceGraph();
    if (this.ambienceMasterGain && this.ctx) {
      const now = this.ctx.currentTime;
      const target = Math.max(0.0001, this.getTargetAmbienceGain());
      this.ambienceMasterGain.gain.cancelScheduledValues(now);
      this.ambienceMasterGain.gain.setTargetAtTime(target, now, 0.12);
    }
  }

  private ensureCathedralAmbienceGraph(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    if (!this.ambienceMasterGain || !this.cathedralEchoInput) {
      const master = ctx.createGain();
      master.gain.setValueAtTime(Math.max(0.0001, this.getTargetAmbienceGain()), ctx.currentTime);
      master.connect(ctx.destination);
      this.ambienceMasterGain = master;

      // Gothic Cathedral Stone Nave Multi-Tap Echo / Reverb Network
      const echoInput = ctx.createGain();
      echoInput.gain.value = 1.0;

      const delayLeft = ctx.createDelay(2.0);
      delayLeft.delayTime.value = 0.39;

      const delayRight = ctx.createDelay(2.0);
      delayRight.delayTime.value = 0.57;

      const dampLeft = ctx.createBiquadFilter();
      dampLeft.type = 'lowpass';
      dampLeft.frequency.value = 1280;

      const dampRight = ctx.createBiquadFilter();
      dampRight.type = 'lowpass';
      dampRight.frequency.value = 1120;

      const highpassNave = ctx.createBiquadFilter();
      highpassNave.type = 'highpass';
      highpassNave.frequency.value = 105;

      const fbLeft = ctx.createGain();
      fbLeft.gain.value = 0.46;

      const fbRight = ctx.createGain();
      fbRight.gain.value = 0.44;

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.82;

      echoInput.connect(highpassNave);
      highpassNave.connect(delayLeft);
      highpassNave.connect(delayRight);

      delayLeft.connect(dampLeft);
      dampLeft.connect(fbLeft);
      fbLeft.connect(delayRight);
      dampLeft.connect(wetGain);

      delayRight.connect(dampRight);
      dampRight.connect(fbRight);
      fbRight.connect(delayLeft);
      dampRight.connect(wetGain);

      wetGain.connect(master);
      this.cathedralEchoInput = echoInput;
    }

    if (!this.ambienceDroneStop) {
      this.startCathedralBourdonDrone(ctx);
    }

    if (this.ambiencePhraseTimer === null && typeof window !== 'undefined') {
      this.scheduleNextGregorianPhrase();
      this.ambiencePhraseTimer = window.setInterval(() => {
        if (this.shouldPlayAmbience()) {
          this.scheduleNextGregorianPhrase();
        }
      }, 6400);
    }
  }

  private startCathedralBourdonDrone(ctx: AudioContext): void {
    if (!this.ambienceMasterGain || !this.cathedralEchoInput) return;

    try {
      const droneBus = ctx.createGain();
      droneBus.gain.value = 0.25;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.11;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.06;
      lfo.connect(lfoDepth);
      lfoDepth.connect(droneBus.gain);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 310;

      const oscD2 = ctx.createOscillator();
      oscD2.type = 'sine';
      oscD2.frequency.value = 73.42;

      const oscA2 = ctx.createOscillator();
      oscA2.type = 'triangle';
      oscA2.frequency.value = 110.0;
      const a2Gain = ctx.createGain();
      a2Gain.gain.value = 0.42;

      oscD2.connect(lp);
      oscA2.connect(a2Gain);
      a2Gain.connect(lp);

      lp.connect(droneBus);
      droneBus.connect(this.ambienceMasterGain);
      droneBus.connect(this.cathedralEchoInput);

      lfo.start();
      oscD2.start();
      oscA2.start();

      this.ambienceDroneStop = () => {
        try {
          lfo.stop();
          oscD2.stop();
          oscA2.stop();
          droneBus.disconnect();
        } catch {
          // Ignore stop errors
        }
      };
    } catch {
      // Ignore audio initialization errors
    }
  }

  private stopAmbienceScheduler(): void {
    if (this.ambiencePhraseTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.ambiencePhraseTimer);
      this.ambiencePhraseTimer = null;
    }
  }

  private scheduleNextGregorianPhrase(): void {
    if (!this.shouldPlayAmbience()) return;
    const ctx = this.getContext();
    if (!ctx || !this.ambienceMasterGain || !this.cathedralEchoInput) return;

    const phrase =
      GREGORIAN_CHANT_PHRASES[this.ambiencePhraseIndex % GREGORIAN_CHANT_PHRASES.length];
    const vowel =
      CHOIR_VOWEL_FORMANTS[this.ambiencePhraseIndex % CHOIR_VOWEL_FORMANTS.length];
    this.ambiencePhraseIndex++;

    const now = ctx.currentTime;
    const noteSpacing = 1.08;

    phrase.forEach((freq, idx) => {
      const noteStart = now + 0.08 + idx * noteSpacing;
      const isFinalNote = idx === phrase.length - 1;
      const noteDuration = isFinalNote ? 1.85 : 1.18;
      this.triggerGregorianChoirSyllable(
        ctx,
        freq,
        vowel,
        noteStart,
        noteDuration,
        isFinalNote
      );
    });

    if (this.ambiencePhraseIndex % 2 === 0) {
      const bellTime = now + 0.35;
      const bellOsc = ctx.createOscillator();
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(
        this.ambiencePhraseIndex % 4 === 0 ? 587.33 : 880.0,
        bellTime
      );

      const bellGain = ctx.createGain();
      bellGain.gain.setValueAtTime(0.0001, bellTime);
      bellGain.gain.linearRampToValueAtTime(0.058, bellTime + 0.04);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, bellTime + 3.2);

      bellOsc.connect(bellGain);
      bellGain.connect(this.cathedralEchoInput);
      bellOsc.start(bellTime);
      bellOsc.stop(bellTime + 3.25);
    }
  }

  private triggerGregorianChoirSyllable(
    ctx: AudioContext,
    baseFreq: number,
    formants: [number, number, number],
    startTime: number,
    duration: number,
    addFifthHarmony: boolean
  ): void {
    if (!this.ambienceMasterGain || !this.cathedralEchoInput) return;

    const formantSum = ctx.createGain();
    formantSum.gain.setValueAtTime(0.0001, startTime);
    formantSum.gain.linearRampToValueAtTime(0.38, startTime + 0.32);
    formantSum.gain.setValueAtTime(0.35, startTime + duration * 0.65);
    formantSum.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.45);

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(formants[0], startTime);
    f1.Q.value = 4.8;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(formants[1], startTime);
    f2.Q.value = 6.2;

    const f3 = ctx.createBiquadFilter();
    f3.type = 'bandpass';
    f3.frequency.setValueAtTime(formants[2], startTime);
    f3.Q.value = 7.5;

    const f1Gain = ctx.createGain();
    f1Gain.gain.value = 1.0;
    const f2Gain = ctx.createGain();
    f2Gain.gain.value = 0.56;
    const f3Gain = ctx.createGain();
    f3Gain.gain.value = 0.22;

    f1.connect(f1Gain);
    f2.connect(f2Gain);
    f3.connect(f3Gain);
    f1Gain.connect(formantSum);
    f2Gain.connect(formantSum);
    f3Gain.connect(formantSum);

    const dryVocal = ctx.createGain();
    dryVocal.gain.value = 0.46;
    formantSum.connect(dryVocal);
    dryVocal.connect(this.ambienceMasterGain);
    formantSum.connect(this.cathedralEchoInput);

    const vibrato = ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.setValueAtTime(4.9, startTime);
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.setValueAtTime(1.15, startTime);
    vibrato.connect(vibratoGain);
    vibrato.start(startTime);
    vibrato.stop(startTime + duration + 0.5);

    const voiceFreqs = addFifthHarmony
      ? [baseFreq, baseFreq * 1.003, baseFreq * 0.997, baseFreq * 1.498]
      : [baseFreq, baseFreq * 1.0035, baseFreq * 0.9965];

    voiceFreqs.forEach((vf, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(vf, startTime);
      vibratoGain.connect(osc.frequency);

      const vGain = ctx.createGain();
      vGain.gain.value = i === 3 ? 0.18 : 0.34;

      osc.connect(vGain);
      vGain.connect(f1);
      vGain.connect(f2);
      vGain.connect(f3);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.5);
    });
  }

  // ==========================================================================
  // HAPTIC FEEDBACK (Vibration API for Android Chrome / Capacitor WebView)
  // ==========================================================================
  public vibrate(pattern: number | number[]): void {
    if (!this.settings.hapticsEnabled) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors on unsupported devices
    }
  }

  // ==========================================================================
  // MATCH START SOUND
  // ==========================================================================
  public playMatchStart(): void {
    this.vibrate([20, 35, 30]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    [146.83, 220.0, 293.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.24 * masterGain, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.75);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.78);
    });
  }

  // ==========================================================================
  // 1. PIECE SELECT (Subtle carved marble tap + faint arcane chime)
  // ==========================================================================
  public playPieceSelect(): void {
    this.vibrate(10);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.055);

    gain.gain.setValueAtTime(0.28 * masterGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  // ==========================================================================
  // 2. STONE SLIDE & HEAVY MARBLE THUD (Normal Piece Move)
  // ==========================================================================
  public playPieceMove(): void {
    this.vibrate([14, 30, 22]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    const slideDuration = 0.24;
    const bufferSize = Math.floor(ctx.sampleRate * slideDuration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.55;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(340, now);
    bandpass.frequency.linearRampToValueAtTime(220, now + slideDuration);
    bandpass.Q.setValueAtTime(2.4, now);

    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(0.01, now);
    slideGain.gain.linearRampToValueAtTime(0.22 * masterGain, now + 0.05);
    slideGain.gain.exponentialRampToValueAtTime(0.001, now + slideDuration);

    noise.connect(bandpass);
    bandpass.connect(slideGain);
    slideGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + slideDuration);

    const thudTime = now + 0.16;
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(118, thudTime);
    thudOsc.frequency.exponentialRampToValueAtTime(38, thudTime + 0.14);

    thudGain.gain.setValueAtTime(0.55 * masterGain, thudTime);
    thudGain.gain.exponentialRampToValueAtTime(0.001, thudTime + 0.15);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(thudTime);
    thudOsc.stop(thudTime + 0.16);
  }

  // ==========================================================================
  // 3. ATTACK WINDUP (Electric Storm Charge & Weapon Swing Before Thunderbolt)
  // ==========================================================================
  public playAttackWindup(): void {
    this.vibrate(22);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();
    const duration = 0.24;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const spike = Math.random() > 0.92 ? 1.8 : 0.6;
      data[i] = (Math.random() * 2 - 1) * spike;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(1950, now + duration * 0.85);
    filter.Q.setValueAtTime(2.6, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.42 * masterGain, now + duration * 0.72);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  }

  // ==========================================================================
  // 4. CAPTURE STRIKE ("BOJROPAT" THUNDERBOLT CRACK + INITIAL STONE FRACTURE)
  // ==========================================================================
  public playCaptureStrike(): void {
    this.vibrate([65, 20, 95, 25, 60]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    // 1. SKY-SPLITTING LIGHTNING BOLT SNAP ("Bojropat" Electric Whip-Crack)
    const crackDur = 0.16;
    const crackSamples = Math.floor(ctx.sampleRate * crackDur);
    const crackBuf = ctx.createBuffer(1, crackSamples, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackSamples; i++) {
      const t = i / crackSamples;
      const jagged = Math.random() > 0.18 ? 1.0 : -0.95;
      crackData[i] = (Math.random() * 2 - 1) * jagged * Math.pow(1 - t, 0.45);
    }

    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(3200, now);
    crackFilter.frequency.exponentialRampToValueAtTime(680, now + crackDur);
    crackFilter.Q.setValueAtTime(1.15, now);

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(1.0 * masterGain, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + crackDur);

    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(ctx.destination);
    if (this.cathedralEchoInput) {
      crackGain.connect(this.cathedralEchoInput);
    }
    crackSrc.start(now);
    crackSrc.stop(now + crackDur);

    // 2. HIGH-VOLTAGE LIGHTNING ARC TRANSIENT
    const arcOsc = ctx.createOscillator();
    const arcGain = ctx.createGain();
    arcOsc.type = 'sawtooth';
    arcOsc.frequency.setValueAtTime(2100, now);
    arcOsc.frequency.exponentialRampToValueAtTime(48, now + 0.095);

    arcGain.gain.setValueAtTime(0.68 * masterGain, now);
    arcGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    arcOsc.connect(arcGain);
    arcGain.connect(ctx.destination);
    arcOsc.start(now);
    arcOsc.stop(now + 0.105);

    // 3. MASSIVE THUNDERCLAP SUB-SHOCKWAVE
    const boomOsc = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(148, now);
    boomOsc.frequency.exponentialRampToValueAtTime(22, now + 0.62);

    boomGain.gain.setValueAtTime(0.98 * masterGain, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    boomOsc.connect(boomGain);
    boomGain.connect(ctx.destination);
    boomOsc.start(now);
    boomOsc.stop(now + 0.66);

    // 4. ROLLING THUNDER RUMBLE ACROSS THE CATHEDRAL
    const thunderDur = 1.15;
    const thunderSamples = Math.floor(ctx.sampleRate * thunderDur);
    const thunderBuf = ctx.createBuffer(1, thunderSamples, ctx.sampleRate);
    const thunderData = thunderBuf.getChannelData(0);
    for (let i = 0; i < thunderSamples; i++) {
      const t = i / ctx.sampleRate;
      const crest1 = Math.exp(-t * 6.5);
      const crest2 = 0.62 * Math.exp(-Math.pow((t - 0.19) / 0.11, 2));
      const crest3 = 0.42 * Math.exp(-Math.pow((t - 0.44) / 0.18, 2));
      const env = Math.min(1.0, crest1 + crest2 + crest3);
      thunderData[i] = (Math.random() * 2 - 1) * env;
    }

    const thunderSrc = ctx.createBufferSource();
    thunderSrc.buffer = thunderBuf;

    const thunderLp = ctx.createBiquadFilter();
    thunderLp.type = 'lowpass';
    thunderLp.frequency.setValueAtTime(520, now);
    thunderLp.frequency.exponentialRampToValueAtTime(78, now + thunderDur);

    const thunderGain = ctx.createGain();
    thunderGain.gain.setValueAtTime(0.88 * masterGain, now);
    thunderGain.gain.exponentialRampToValueAtTime(0.001, now + thunderDur);

    thunderSrc.connect(thunderLp);
    thunderLp.connect(thunderGain);
    thunderGain.connect(ctx.destination);
    thunderSrc.start(now);
    thunderSrc.stop(now + thunderDur);

    // 5. SHARP MARBLE STATUE SPLITTING FRACTURE
    [880, 1480, 2320].forEach((freq, idx) => {
      const stoneOsc = ctx.createOscillator();
      const stoneGain = ctx.createGain();
      stoneOsc.type = 'triangle';
      const t0 = now + idx * 0.008;
      stoneOsc.frequency.setValueAtTime(freq, t0);
      stoneOsc.frequency.exponentialRampToValueAtTime(freq * 0.28, t0 + 0.065);

      stoneGain.gain.setValueAtTime(0.45 * masterGain, t0);
      stoneGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);

      stoneOsc.connect(stoneGain);
      stoneGain.connect(ctx.destination);
      stoneOsc.start(t0);
      stoneOsc.stop(t0 + 0.075);
    });
  }

  // ==========================================================================
  // 5. STONE SHATTER ("VENGE FELA" HEAVY STATUE DEMOLITION + THUNDER AFTERSHOCK)
  // ==========================================================================
  public playStoneShatter(): void {
    this.vibrate([85, 25, 65, 25, 50, 30, 35]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    const fractureOffsets = [0, 0.022, 0.052, 0.095];
    fractureOffsets.forEach((offset, idx) => {
      const start = now + offset;
      const snapDur = 0.14 - idx * 0.015;
      const snapSamples = Math.floor(ctx.sampleRate * snapDur);
      const snapBuf = ctx.createBuffer(1, snapSamples, ctx.sampleRate);
      const snapData = snapBuf.getChannelData(0);
      for (let i = 0; i < snapSamples; i++) {
        snapData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / snapSamples, 0.55);
      }

      const snapSrc = ctx.createBufferSource();
      snapSrc.buffer = snapBuf;

      const stoneBp = ctx.createBiquadFilter();
      stoneBp.type = 'bandpass';
      stoneBp.frequency.setValueAtTime(1150 + idx * 420, start);
      stoneBp.frequency.exponentialRampToValueAtTime(360 + idx * 90, start + snapDur);
      stoneBp.Q.setValueAtTime(2.2, start);

      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime((0.92 - idx * 0.14) * masterGain, start);
      snapGain.gain.exponentialRampToValueAtTime(0.001, start + snapDur);

      snapSrc.connect(stoneBp);
      stoneBp.connect(snapGain);
      snapGain.connect(ctx.destination);
      if (this.cathedralEchoInput && idx === 0) {
        snapGain.connect(this.cathedralEchoInput);
      }
      snapSrc.start(start);
      snapSrc.stop(start + snapDur);
    });

    const aftershockDur = 1.35;
    const aftershockSamples = Math.floor(ctx.sampleRate * aftershockDur);
    const aftershockBuf = ctx.createBuffer(1, aftershockSamples, ctx.sampleRate);
    const aftershockData = aftershockBuf.getChannelData(0);
    for (let i = 0; i < aftershockSamples; i++) {
      const t = i / ctx.sampleRate;
      const roll =
        Math.exp(-t * 3.8) * (0.75 + 0.25 * Math.sin(t * 24) * Math.cos(t * 11));
      aftershockData[i] = (Math.random() * 2 - 1) * roll;
    }

    const aftershockSrc = ctx.createBufferSource();
    aftershockSrc.buffer = aftershockBuf;

    const aftershockLp = ctx.createBiquadFilter();
    aftershockLp.type = 'lowpass';
    aftershockLp.frequency.setValueAtTime(420, now);
    aftershockLp.frequency.exponentialRampToValueAtTime(62, now + aftershockDur);

    const aftershockGain = ctx.createGain();
    aftershockGain.gain.setValueAtTime(0.84 * masterGain, now);
    aftershockGain.gain.exponentialRampToValueAtTime(0.001, now + aftershockDur);

    aftershockSrc.connect(aftershockLp);
    aftershockLp.connect(aftershockGain);
    aftershockGain.connect(ctx.destination);
    aftershockSrc.start(now);
    aftershockSrc.stop(now + aftershockDur);

    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(112, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + 0.58);

    subGain.gain.setValueAtTime(0.92 * masterGain, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.64);

    for (let i = 0; i < 22; i++) {
      const delay = 0.015 + Math.pow(i / 22, 1.35) * 0.78 + Math.random() * 0.045;
      const startTime = now + delay;
      const isHeavyChunk = i < 8;
      const shardDuration = isHeavyChunk
        ? 0.065 + Math.random() * 0.055
        : 0.032 + Math.random() * 0.038;

      const shardOsc = ctx.createOscillator();
      const shardGain = ctx.createGain();
      shardOsc.type = 'triangle';

      const baseFreq = isHeavyChunk
        ? 240 + Math.random() * 420
        : 780 + Math.random() * 2100;
      shardOsc.frequency.setValueAtTime(baseFreq, startTime);
      shardOsc.frequency.exponentialRampToValueAtTime(
        baseFreq * 0.34,
        startTime + shardDuration
      );

      const amp = (isHeavyChunk ? 0.38 : 0.22) * (1 - i / 28) * masterGain;
      shardGain.gain.setValueAtTime(Math.max(0.002, amp), startTime);
      shardGain.gain.exponentialRampToValueAtTime(0.0008, startTime + shardDuration);

      shardOsc.connect(shardGain);
      shardGain.connect(ctx.destination);
      shardOsc.start(startTime);
      shardOsc.stop(startTime + shardDuration + 0.01);

      if (i < 10) {
        const chipSamples = Math.floor(ctx.sampleRate * 0.024);
        const chipBuf = ctx.createBuffer(1, chipSamples, ctx.sampleRate);
        const chipData = chipBuf.getChannelData(0);
        for (let k = 0; k < chipSamples; k++) {
          chipData[k] = (Math.random() * 2 - 1) * (1 - k / chipSamples);
        }
        const chipSrc = ctx.createBufferSource();
        chipSrc.buffer = chipBuf;

        const chipHp = ctx.createBiquadFilter();
        chipHp.type = 'bandpass';
        chipHp.frequency.setValueAtTime(1950 + Math.random() * 1400, startTime);
        chipHp.Q.setValueAtTime(3.0, startTime);

        const chipGain = ctx.createGain();
        chipGain.gain.setValueAtTime(0.28 * masterGain, startTime);
        chipGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.024);

        chipSrc.connect(chipHp);
        chipHp.connect(chipGain);
        chipGain.connect(ctx.destination);
        chipSrc.start(startTime);
        chipSrc.stop(startTime + 0.025);
      }
    }
  }

  // ==========================================================================
  // 6. KING IN CHECK ALARM ("RAJA CHECK" URGENT DANGER BELL + BLADE CLASH)
  // Called via both playKingCheck() and playCheckWarning()
  // ==========================================================================
  public playKingCheck(): void {
    this.playCheckWarning();
  }

  public playCheckWarning(): void {
    this.vibrate([70, 40, 95, 40, 70]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    // 1. Urgent Double Danger Pulse (Crimson Court Alert)
    [0, 0.22].forEach((pulseOffset, pIdx) => {
      const t0 = now + pulseOffset;

      // Sharp metallic sword/crown danger ring + ominous tritone cathedral warning bell
      const bellFreqs = pIdx === 0 ? [440.0, 622.25, 880.0] : [587.33, 830.61, 1174.66];
      bellFreqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 1 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(f, t0);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2800, t0);
        filter.frequency.exponentialRampToValueAtTime(650, t0 + 0.65);

        const peak = (idx === 0 ? 0.52 : 0.28) * masterGain;
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.72);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        if (this.cathedralEchoInput) {
          gain.connect(this.cathedralEchoInput);
        }
        osc.start(t0);
        osc.stop(t0 + 0.75);
      });

      // Deep warning heartbeat thud under each check alarm pulse
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(110, t0);
      subOsc.frequency.exponentialRampToValueAtTime(36, t0 + 0.19);
      subGain.gain.setValueAtTime(0.65 * masterGain, t0);
      subGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.21);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(t0);
      subOsc.stop(t0 + 0.22);
    });
  }

  // ==========================================================================
  // 7. WAR VICTORY HORN ("JUDDHE JITAR HORN" — EPIC MEDIEVAL BATTLE WARHORN)
  // Called when the Player wins by Checkmate (or in 2-Player Local Checkmate)
  // ==========================================================================
  public playCheckmateVictory(): void {
    this.playWarVictoryHorn();
  }

  public playCheckmateFanfare(): void {
    this.playWarVictoryHorn();
  }

  public playWarVictoryHorn(): void {
    this.vibrate([110, 45, 110, 45, 280]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    // War Drum Double Boom at the start of the horn call
    [0, 0.28, 0.92].forEach((drumOffset, idx) => {
      const tDrum = now + drumOffset;
      const drumOsc = ctx.createOscillator();
      const drumGain = ctx.createGain();
      drumOsc.type = 'sine';
      drumOsc.frequency.setValueAtTime(idx === 2 ? 128 : 98, tDrum);
      drumOsc.frequency.exponentialRampToValueAtTime(26, tDrum + 0.42);
      drumGain.gain.setValueAtTime(0.85 * masterGain, tDrum);
      drumGain.gain.exponentialRampToValueAtTime(0.001, tDrum + 0.45);
      drumOsc.connect(drumGain);
      drumGain.connect(ctx.destination);
      drumOsc.start(tDrum);
      drumOsc.stop(tDrum + 0.46);
    });

    // Epic Two-Stage Medieval Battle Warhorn Call ("Juddhe Jitar Horn"):
    // Call 1 (0.0s - 1.05s): Deep resonant D3/A3 battle horn blast
    // Call 2 (0.92s - 2.85s): Triumphant soaring Royal Warhorn chord (D3 + A3 + D4 + F#4 + A4)
    const hornBlasts = [
      // First warhorn call (deep brass call to arms)
      { freq: 146.83, start: 0.0, dur: 1.05, amp: 0.46, detune: -6 },
      { freq: 146.83, start: 0.0, dur: 1.05, amp: 0.46, detune: 6 },
      { freq: 220.0, start: 0.02, dur: 1.02, amp: 0.34, detune: 3 },
      // Second grand victorious warhorn blast ("Juddhe Jitar Horn" climax)
      { freq: 146.83, start: 0.92, dur: 2.15, amp: 0.48, detune: -7 },
      { freq: 220.0, start: 0.92, dur: 2.15, amp: 0.38, detune: 5 },
      { freq: 293.66, start: 0.94, dur: 2.15, amp: 0.44, detune: -4 },
      { freq: 293.66, start: 0.94, dur: 2.15, amp: 0.44, detune: 7 },
      { freq: 369.99, start: 0.98, dur: 2.08, amp: 0.32, detune: 0 }, // F#4 major triumph third
      { freq: 440.0, start: 1.02, dur: 2.05, amp: 0.38, detune: 4 },
    ];

    hornBlasts.forEach((h) => {
      const t0 = now + h.start;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      // Characteristic warhorn lip-swell pitch bend on attack
      osc.frequency.setValueAtTime(h.freq * 0.955, t0);
      osc.frequency.exponentialRampToValueAtTime(h.freq, t0 + 0.14);
      osc.detune.setValueAtTime(h.detune, t0);

      // Brass horn formant resonant lowpass + peaking bell filter
      const brassFilter = ctx.createBiquadFilter();
      brassFilter.type = 'lowpass';
      brassFilter.frequency.setValueAtTime(380, t0);
      brassFilter.frequency.exponentialRampToValueAtTime(1850, t0 + 0.28);
      brassFilter.frequency.exponentialRampToValueAtTime(680, t0 + h.dur);
      brassFilter.Q.setValueAtTime(2.4, t0);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(h.amp * masterGain, t0 + 0.16);
      gain.gain.setValueAtTime(h.amp * 0.88 * masterGain, t0 + h.dur * 0.68);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + h.dur);

      osc.connect(brassFilter);
      brassFilter.connect(gain);
      gain.connect(ctx.destination);
      if (this.cathedralEchoInput) {
        gain.connect(this.cathedralEchoInput);
      }
      osc.start(t0);
      osc.stop(t0 + h.dur + 0.05);
    });
  }

  // ==========================================================================
  // 8. AI DEFEAT SOUND (When Player loses against AI — Somber Doom Horn & Dirge)
  // ==========================================================================
  public playDefeatSound(): void {
    this.vibrate([120, 60, 180, 60, 260]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    // Crushing dark sub-bass fall
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(95, now);
    subOsc.frequency.exponentialRampToValueAtTime(22, now + 1.45);
    subGain.gain.setValueAtTime(0.85 * masterGain, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 1.55);

    // Mournful descending Fallen Kingdom Horn notes (D3 -> Bb2 -> A2 -> D2)
    const defeatNotes = [
      { freq: 146.83, endFreq: 142.0, start: 0.0, dur: 0.65, amp: 0.42 },
      { freq: 116.54, endFreq: 112.0, start: 0.55, dur: 0.65, amp: 0.42 },
      { freq: 110.0, endFreq: 104.0, start: 1.1, dur: 0.75, amp: 0.44 },
      { freq: 73.42, endFreq: 69.3, start: 1.7, dur: 1.65, amp: 0.52 },
    ];

    defeatNotes.forEach((n) => {
      const t0 = now + n.start;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.freq, t0);
      osc.frequency.linearRampToValueAtTime(n.endFreq, t0 + n.dur);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(620, t0);
      filter.frequency.exponentialRampToValueAtTime(210, t0 + n.dur);
      filter.Q.setValueAtTime(1.8, t0);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(n.amp * masterGain, t0 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + n.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      if (this.cathedralEchoInput) {
        gain.connect(this.cathedralEchoInput);
      }
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.05);
    });
  }

  // ==========================================================================
  // 9. STALEMATE / DRAW SOUND (Solemn Sanctum Truce Horn & Balanced Chime)
  // ==========================================================================
  public playDrawSound(): void {
    this.vibrate([50, 50, 50, 50, 90]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    // Suspended neutral truce chord (D3 - G3 - A3 - D4) with hollow bronze chime
    const truceNotes = [
      { freq: 146.83, start: 0.0, dur: 1.2, amp: 0.34, type: 'triangle' as OscillatorType },
      { freq: 196.0, start: 0.18, dur: 1.2, amp: 0.32, type: 'triangle' as OscillatorType },
      { freq: 220.0, start: 0.36, dur: 1.3, amp: 0.3, type: 'sine' as OscillatorType },
      { freq: 293.66, start: 0.56, dur: 1.5, amp: 0.32, type: 'triangle' as OscillatorType },
    ];

    truceNotes.forEach((n) => {
      const t0 = now + n.start;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, t0);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(n.amp * masterGain, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      if (this.cathedralEchoInput) {
        gain.connect(this.cathedralEchoInput);
      }
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.04);
    });
  }

  // ==========================================================================
  // 10. UI BUTTON CLICK & REWARD UNLOCK CHIME
  // ==========================================================================
  public playButtonClick(): void {
    this.vibrate(8);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.035);

    gain.gain.setValueAtTime(0.18 * masterGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playRewardGranted(): void {
    this.vibrate([20, 40, 45]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + i * 0.07;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.28 * masterGain, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.36);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.38);
    });
  }

  public playRewardUnlocked(): void {
    this.playRewardGranted();
  }
}

export const soundAndHaptics = new SoundAndHapticsManager();

declare global {
  interface Window {
    wizardChessAudio?: SoundAndHapticsManager;
  }
}

if (typeof window !== 'undefined') {
  window.wizardChessAudio = soundAndHaptics;
}
