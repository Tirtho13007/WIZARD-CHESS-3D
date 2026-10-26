// ============================================================================
// ARCANE CHESS 3D — REALISTIC WEB AUDIO SYNTHESIZER & ANDROID HAPTICS ENGINE
// Includes:
//  - Faint Gregorian Chanting & Gothic Cathedral Echoes background loop
//    that dynamically scales with volume settings during matches
//  - Visceral Thunderbolt ("Bojropat") + Stone Statue Shatter ("Venge Fela")
//    piece capture sound effects
// ============================================================================

export interface AudioHapticSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0 to 100
  hapticsEnabled: boolean;
}

const STORAGE_KEY = 'wizard_chess_3d_audio_settings_v1';

const DEFAULT_SETTINGS: AudioHapticSettings = {
  soundEnabled: true,
  soundVolume: 85,
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
    // Faint, reverent background level that scales linearly & smoothly with volume (0..100)
    const normalizedVol = Math.max(0, Math.min(100, this.settings.soundVolume)) / 100;
    return normalizedVol * 0.24;
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
      // Master gain for all Gregorian chant & cathedral ambience (scales dynamically with volume)
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
      wetGain.gain.value = 0.68;

      echoInput.connect(highpassNave);
      highpassNave.connect(delayLeft);
      highpassNave.connect(delayRight);

      delayLeft.connect(dampLeft);
      dampLeft.connect(fbLeft);
      fbLeft.connect(delayRight); // Cross-feed for spacious cathedral vault decay
      dampLeft.connect(wetGain);

      delayRight.connect(dampRight);
      dampRight.connect(fbRight);
      fbRight.connect(delayLeft);
      dampRight.connect(wetGain);

      wetGain.connect(master);
      this.cathedralEchoInput = echoInput;
    }

    // Ensure continuous faint Cathedral Bourdon / Sub-Organ Drone is running
    if (!this.ambienceDroneStop) {
      this.startCathedralBourdonDrone(ctx);
    }

    // Ensure Gregorian Chant phrase loop is scheduled
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
      droneBus.gain.value = 0.16;

      // Slow breathing LFO so the cathedral air undulates like distant organ bellows
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.11;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.05;
      lfo.connect(lfoDepth);
      lfoDepth.connect(droneBus.gain);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 290;

      // D2 (73.42 Hz) & A2 (110.00 Hz) sacred fifth drone
      const oscD2 = ctx.createOscillator();
      oscD2.type = 'sine';
      oscD2.frequency.value = 73.42;

      const oscA2 = ctx.createOscillator();
      oscA2.type = 'triangle';
      oscA2.frequency.value = 110.0;
      const a2Gain = ctx.createGain();
      a2Gain.gain.value = 0.35;

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

    // Every second phrase, add a faint distant Gothic sanctuary bronze bell echo
    if (this.ambiencePhraseIndex % 2 === 0) {
      const bellTime = now + 0.35;
      const bellOsc = ctx.createOscillator();
      bellOsc.type = 'sine';
      // High D5 or A5 sanctuary harmonic
      bellOsc.frequency.setValueAtTime(this.ambiencePhraseIndex % 4 === 0 ? 587.33 : 880.0, bellTime);

      const bellGain = ctx.createGain();
      bellGain.gain.setValueAtTime(0.0001, bellTime);
      bellGain.gain.linearRampToValueAtTime(0.032, bellTime + 0.04);
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

    // 3-band Vowel Formant Filter Bank for realistic monastic choir timbre
    const formantSum = ctx.createGain();
    formantSum.gain.setValueAtTime(0.0001, startTime);
    formantSum.gain.linearRampToValueAtTime(0.26, startTime + 0.32);
    formantSum.gain.setValueAtTime(0.24, startTime + duration * 0.65);
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
    f2Gain.gain.value = 0.52;
    const f3Gain = ctx.createGain();
    f3Gain.gain.value = 0.18;

    f1.connect(f1Gain);
    f2.connect(f2Gain);
    f3.connect(f3Gain);
    f1Gain.connect(formantSum);
    f2Gain.connect(formantSum);
    f3Gain.connect(formantSum);

    // Connect choir voices mostly to the Cathedral Echo Network for distant vaulted realism
    const dryVocal = ctx.createGain();
    dryVocal.gain.value = 0.32;
    formantSum.connect(dryVocal);
    dryVocal.connect(this.ambienceMasterGain);
    formantSum.connect(this.cathedralEchoInput);

    // Subtle vocal vibrato
    const vibrato = ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.setValueAtTime(4.9, startTime);
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.setValueAtTime(1.15, startTime);
    vibrato.connect(vibratoGain);
    vibrato.start(startTime);
    vibrato.stop(startTime + duration + 0.5);

    // Ensemble of detuned monk voices (baritone/tenor unison + optional organum fifth on cadences)
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

    // Filtered noise for carved stone sliding across marble board
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

    // Heavy stone settling thud at destination square
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

    // Crackling lightning static + weapon air-cleave whoosh
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Add subtle electric crackle spikes
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
  // Sky-splitting lightning bolt snap + deep rolling thunderclap + marble crack
  // ==========================================================================
  public playCaptureStrike(): void {
    // Intense lightning shockwave haptic pattern
    this.vibrate([65, 20, 95, 25, 60]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    // 1. SKY-SPLITTING LIGHTNING BOLT SNAP ("Bojropat" Electric Whip-Crack, 0.0s - 0.16s)
    const crackDur = 0.16;
    const crackSamples = Math.floor(ctx.sampleRate * crackDur);
    const crackBuf = ctx.createBuffer(1, crackSamples, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackSamples; i++) {
      const t = i / crackSamples;
      // Jagged high-voltage discharge envelope
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

    // 2. HIGH-VOLTAGE LIGHTNING ARC TRANSIENT (Downward supersonic shockwave snap)
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

    // 3. MASSIVE THUNDERCLAP SUB-SHOCKWAVE ("Bojropat" Chest-Thumping Boom)
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

    // 4. ROLLING THUNDER RUMBLE ACROSS THE CATHEDRAL (Multi-crest thunder tail, 1.15s)
    const thunderDur = 1.15;
    const thunderSamples = Math.floor(ctx.sampleRate * thunderDur);
    const thunderBuf = ctx.createBuffer(1, thunderSamples, ctx.sampleRate);
    const thunderData = thunderBuf.getChannelData(0);
    for (let i = 0; i < thunderSamples; i++) {
      const t = i / ctx.sampleRate;
      // Natural rolling thunder crests (initial blast + secondary sky echoes at 0.19s & 0.44s)
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

    // 5. SHARP MARBLE STATUE SPLITTING FRACTURE (Initial stone crack at impact point)
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
  // Crisp brittle stone statue breaking apart + cascading marble rubble + thunder roll
  // ==========================================================================
  public playStoneShatter(): void {
    // Heavy multi-pulse vibration matching stone breaking & rubble hitting the board
    this.vibrate([85, 25, 65, 25, 50, 30, 35]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    // 1. MULTIPLE BRITTLE STONE FRACTURE SNAPS ("Venge Fela" Statue Breaking Apart)
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

      // Resonant stone/marble fracture formants
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

    // 2. DEEP ROLLING THUNDER AFTERSHOCK & STONE DEMOLITION SUB-DROP (1.35s)
    const aftershockDur = 1.35;
    const aftershockSamples = Math.floor(ctx.sampleRate * aftershockDur);
    const aftershockBuf = ctx.createBuffer(1, aftershockSamples, ctx.sampleRate);
    const aftershockData = aftershockBuf.getChannelData(0);
    for (let i = 0; i < aftershockSamples; i++) {
      const t = i / ctx.sampleRate;
      const roll =
        Math.exp(-t * 3.8) *
        (0.75 + 0.25 * Math.sin(t * 24) * Math.cos(t * 11));
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

    // Sub-bass stone collapse impact
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

    // 3. CASCADING CARVED MARBLE & STONE DEBRIS CLATTERING ON THE BOARD (22 Shards)
    for (let i = 0; i < 22; i++) {
      const delay = 0.015 + Math.pow(i / 22, 1.35) * 0.78 + Math.random() * 0.045;
      const startTime = now + delay;
      const isHeavyChunk = i < 8;
      const shardDuration = isHeavyChunk
        ? 0.065 + Math.random() * 0.055
        : 0.032 + Math.random() * 0.038;

      // Stony percussive knock (short pitched stone resonance)
      const shardOsc = ctx.createOscillator();
      const shardGain = ctx.createGain();
      shardOsc.type = 'triangle';

      const baseFreq = isHeavyChunk
        ? 240 + Math.random() * 420
        : 780 + Math.random() * 2100;
      shardOsc.frequency.setValueAtTime(baseFreq, startTime);
      shardOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.34, startTime + shardDuration);

      const amp = (isHeavyChunk ? 0.38 : 0.22) * (1 - i / 28) * masterGain;
      shardGain.gain.setValueAtTime(Math.max(0.002, amp), startTime);
      shardGain.gain.exponentialRampToValueAtTime(0.0008, startTime + shardDuration);

      shardOsc.connect(shardGain);
      shardGain.connect(ctx.destination);
      shardOsc.start(startTime);
      shardOsc.stop(startTime + shardDuration + 0.01);

      // Crisp marble chip click on the first 10 impacts
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
  // 6. KING IN CHECK WARNING (Ominous Cathedral Brass Bell Toll)
  // ==========================================================================
  public playCheckWarning(): void {
    this.vibrate([50, 60, 90]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    const freqs = [293.66, 415.3, 587.33]; // D4 + G#4 tritone cathedral warning bell
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 1 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(f, now);

      const peak = (idx === 0 ? 0.34 : 0.18) * masterGain;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.95);

      osc.connect(gain);
      gain.connect(ctx.destination);
      if (this.cathedralEchoInput) {
        gain.connect(this.cathedralEchoInput);
      }
      osc.start(now);
      osc.stop(now + 0.98);
    });
  }

  // ==========================================================================
  // 7. CHECKMATE / KING FALL FANFARE (Grand Sanctum Judgment)
  // ==========================================================================
  public playCheckmateFanfare(): void {
    this.vibrate([90, 50, 90, 50, 220]);
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = this.getGain();

    const notes = [
      { freq: 146.83, start: 0.0, dur: 1.6, amp: 0.38 }, // D3
      { freq: 220.0, start: 0.08, dur: 1.6, amp: 0.28 }, // A3
      { freq: 293.66, start: 0.16, dur: 1.7, amp: 0.32 }, // D4
      { freq: 349.23, start: 0.28, dur: 1.8, amp: 0.3 }, // F4
      { freq: 440.0, start: 0.42, dur: 2.1, amp: 0.36 }, // A4
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.freq, now + n.start);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now + n.start);
      filter.frequency.exponentialRampToValueAtTime(420, now + n.start + n.dur);

      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.linearRampToValueAtTime(n.amp * masterGain, now + n.start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + n.start + n.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      if (this.cathedralEchoInput) {
        gain.connect(this.cathedralEchoInput);
      }
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    });
  }

  // ==========================================================================
  // 8. UI BUTTON CLICK & REWARD UNLOCK CHIME
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
