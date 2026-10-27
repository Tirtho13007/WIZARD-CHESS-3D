import { useEffect, useRef, useState } from 'react';
import { initWizardChess } from './wizardChessEngine.js';
import { OfflineIndicator } from './PWAPlayStoreModal';
import {
  ActiveUnityAdRequest,
  initUnityAdsBridge,
  tryShowNativeInterstitialAd,
  tryShowNativeUnityAd,
  UNITY_ADS_CONFIG,
} from './unityAdsManager';
import { UnityAdOverlay } from './UnityAdOverlay';
import { AudioHapticSettings, soundAndHaptics } from './soundAndHaptics';
import { LegalTabType, VantargoLegalModal } from './VantargoLegalModal';

export type AIDifficultyLevel = 'beginner' | 'professional' | 'grandmaster';
export type ChessGameMode = 'single' | 'local';

function formatStopwatch(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function ChronometerStopwatch({
  running,
  resetSeed,
}: {
  running: boolean;
  resetSeed: number;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    setElapsedSeconds(0);
  }, [resetSeed]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const secondHandDeg = (elapsedSeconds % 60) * 6;
  const minuteHandDeg = ((elapsedSeconds / 60) % 60) * 6;

  return (
    <div
      className="chronometer-3d-housing"
      id="match-stopwatch-3d"
      aria-label="Match Elapsed Stopwatch"
    >
      <div className="chronometer-3d-dial" aria-hidden="true">
        <div className="chronometer-crown-knob" />
        <div className="chronometer-bezel">
          <span className="chrono-tick tick-12" />
          <span className="chrono-tick tick-3" />
          <span className="chrono-tick tick-6" />
          <span className="chrono-tick tick-9" />
          <div
            className="chrono-hand minute-hand"
            style={{ transform: `translateX(-50%) rotate(${minuteHandDeg}deg)` }}
          />
          <div
            className="chrono-hand second-hand"
            style={{ transform: `translateX(-50%) rotate(${secondHandDeg}deg)` }}
          />
          <div className="chrono-center-jewel" />
          <div className="chrono-glass-sheen" />
        </div>
      </div>

      <div className="chronometer-readout">
        <span className="chronometer-label">TIME</span>
        <span className="chronometer-digits" id="stopwatch-digits">
          {formatStopwatch(elapsedSeconds)}
        </span>
      </div>
    </div>
  );
}

async function tryLockLandscape(): Promise<boolean> {
  try {
    const scr = window.screen as Screen & {
      orientation?: { lock?: (orientation: string) => Promise<void> };
    };
    if (scr?.orientation?.lock) {
      await scr.orientation.lock('landscape');
      return true;
    }
  } catch {
    // Handled automatically by 90-degree CSS stage rotation when in portrait
  }
  return false;
}

interface WizardChessWindowAPI {
  toggleUI?: (force?: boolean) => boolean;
  canUndo?: () => boolean;
  undoFullRound?: () => { ok: boolean; undoneCount: number; moveHistoryCount?: number };
  showBestMoveHint?: () => {
    ok: boolean;
    label?: string;
    fromCoord?: string;
    toCoord?: string;
    pieceType?: string;
    capture?: boolean;
    reason?: string;
  };
  setAIDifficulty?: (level: AIDifficultyLevel) => AIDifficultyLevel;
  getAIDifficulty?: () => AIDifficultyLevel;
  setGameMode?: (mode: ChessGameMode) => ChessGameMode;
  getGameMode?: () => ChessGameMode;
  setGamePaused?: (paused: boolean) => boolean;
  startNewMatch?: (opts: {
    mode?: ChessGameMode;
    side: 'w' | 'b';
    difficulty: AIDifficultyLevel;
  }) => void;
  resetChessBoard?: (orientCamera?: boolean, preserveScript?: boolean) => void;
  setCameraPreset?: (preset: string) => void;
  getState?: () => {
    moveHistoryCount: number;
    gameOver: boolean;
    currentTurn: string;
    playerColor: string;
    gameMode?: ChessGameMode;
  };
}

function getEngineAPI(): WizardChessWindowAPI | undefined {
  return (window as unknown as { wizardChess?: WizardChessWindowAPI }).wizardChess;
}

export default function App() {
  const initializedRef = useRef(false);
  const isAutotest =
    typeof window !== 'undefined' &&
    Boolean(
      navigator.webdriver || new URLSearchParams(window.location.search).get('autotest') === '1'
    );

  const [matchStarted, setMatchStarted] = useState<boolean>(isAutotest);
  const [selectedGameMode, setSelectedGameMode] = useState<ChessGameMode>('single');
  const [selectedDifficulty, setSelectedDifficulty] = useState<AIDifficultyLevel>('professional');
  const [selectedSide, setSelectedSide] = useState<'w' | 'b'>('w');
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [settingsOnlyModal, setSettingsOnlyModal] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTabType | null>(null);
  const [activeCamPreset, setActiveCamPreset] = useState<'player' | 'top' | 'side' | 'wide'>(
    'player'
  );
  const [audioSettings, setAudioSettings] = useState<AudioHapticSettings>(() =>
    soundAndHaptics.getSettings()
  );

  // Seed counter to reset the isolated 3D Stopwatch without re-rendering App every second
  const [stopwatchResetSeed, setStopwatchResetSeed] = useState<number>(0);

  // Automatic 90-degree Landscape Rotation whenever device viewport is Portrait (height > width)
  const [forceRotate90, setForceRotate90] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  const [gameOver, setGameOver] = useState(false);
  const [activeAd, setActiveAd] = useState<ActiveUnityAdRequest | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const showToast = (msg: string, durationMs = 4000) => {
    setFeedbackBanner(msg);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackBanner(null);
    }, durationMs);
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    (window as unknown as { __reactHandlesReset?: boolean }).__reactHandlesReset = true;
    initUnityAdsBridge();
    initWizardChess();
    tryLockLandscape();

    const params = new URLSearchParams(window.location.search);
    if (params.get('side') === 'black') {
      setSelectedSide('b');
    }
  }, []);

  // Enforce 100% Landscape mode at all times: if height > width, rotate entire stage 90 degrees
  useEffect(() => {
    const syncLandscapeStage = () => {
      const portrait = window.innerHeight > window.innerWidth;
      setForceRotate90(portrait);
      document.body.classList.toggle('force-landscape-active', portrait);
    };
    syncLandscapeStage();
    window.addEventListener('resize', syncLandscapeStage);
    window.addEventListener('orientationchange', syncLandscapeStage);
    return () => {
      window.removeEventListener('resize', syncLandscapeStage);
      window.removeEventListener('orientationchange', syncLandscapeStage);
    };
  }, []);

  const matchEndAdShownRef = useRef<boolean>(false);
  const matchEndAdTimerRef = useRef<number | null>(null);

  const scheduleMatchEndVideoAd = () => {
    if (matchEndAdShownRef.current) return;
    matchEndAdShownRef.current = true;
    if (matchEndAdTimerRef.current) {
      window.clearTimeout(matchEndAdTimerRef.current);
    }
    // Wait 1.8s so the 3D King topple animation completes, then show the match-end video ad
    matchEndAdTimerRef.current = window.setTimeout(() => {
      tryShowNativeInterstitialAd();
    }, 1800);
  };

  useEffect(() => {
    const handleStateChange = (e: Event) => {
      const custom = e as CustomEvent<{
        moveHistoryCount: number;
        gameOver: boolean;
        gameMode?: ChessGameMode;
      }>;
      if (custom.detail) {
        const isOver = Boolean(custom.detail.gameOver);
        setGameOver(isOver);
        if (isOver && custom.detail.moveHistoryCount > 0) {
          scheduleMatchEndVideoAd();
        }
        if (custom.detail.gameMode === 'single' || custom.detail.gameMode === 'local') {
          setSelectedGameMode(custom.detail.gameMode);
        }
      }
    };

    const handleCheckmate = (e: Event) => {
      const custom = e as CustomEvent<{
        winnerColor?: ChessSideColor;
        defeatedColor?: ChessSideColor;
        outcome?: 'victory' | 'defeat';
      }>;
      setGameOver(true);
      if (custom.detail?.outcome === 'defeat') {
        showToast('☠ Defeat • Checkmated by AI', 5500);
      } else {
        showToast('🏆 Victory! Warhorn Sounded • Enemy King Defeated!', 5500);
      }
      scheduleMatchEndVideoAd();
    };

    const handleDraw = (e: Event) => {
      const custom = e as CustomEvent<{ reason?: string }>;
      const reason = custom.detail?.reason || 'Stalemate';
      setGameOver(true);
      showToast(`⚖ Match Drawn (${reason}) • Neither Army Prevails`, 6000);
      scheduleMatchEndVideoAd();
    };

    window.addEventListener('wizardchess:statechange', handleStateChange);
    window.addEventListener('wizardchess:checkmate', handleCheckmate);
    window.addEventListener('wizardchess:draw', handleDraw);
    return () => {
      window.removeEventListener('wizardchess:statechange', handleStateChange);
      window.removeEventListener('wizardchess:checkmate', handleCheckmate);
      window.removeEventListener('wizardchess:draw', handleDraw);
      if (matchEndAdTimerRef.current) {
        window.clearTimeout(matchEndAdTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pauseModalOpen) {
        handleResumeMatch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pauseModalOpen, matchStarted]);

  const resetStopwatch = () => {
    setStopwatchResetSeed((prev) => prev + 1);
    setGameOver(false);
    matchEndAdShownRef.current = false;
    if (matchEndAdTimerRef.current) {
      window.clearTimeout(matchEndAdTimerRef.current);
      matchEndAdTimerRef.current = null;
    }
  };

  // Show Native AdMob / Unity Rewarded Video Ad on Android; only use web overlay when testing in a desktop browser
  const launchUnityRewardedAd = (req: ActiveUnityAdRequest) => {
    const reqWithToast: ActiveUnityAdRequest = {
      ...req,
      onStatusToast: (msg: string) => showToast(msg, 3500),
    };

    const openWebBrowserFallback = () => {
      getEngineAPI()?.setGamePaused?.(true);
      setActiveAd({
        ...reqWithToast,
        onComplete: () => {
          getEngineAPI()?.setGamePaused?.(false);
          req.onComplete();
        },
        onCancel: () => {
          getEngineAPI()?.setGamePaused?.(false);
          req.onCancel?.();
        },
      });
    };

    const handledByNative = tryShowNativeUnityAd(reqWithToast, openWebBrowserFallback);
    if (!handledByNative) {
      openWebBrowserFallback();
    }
  };

  const handleStartMatch = () => {
    soundAndHaptics.playButtonClick();
    tryLockLandscape();
    resetStopwatch();
    setMatchStarted(true);
    soundAndHaptics.setMatchAmbienceActive(true);
    setPauseModalOpen(false);
    setSettingsOnlyModal(false);
    setActiveCamPreset('player');
    setFeedbackBanner(null);

    const api = getEngineAPI();
    if (api?.startNewMatch) {
      api.startNewMatch({
        mode: selectedGameMode,
        side: selectedGameMode === 'local' ? 'w' : selectedSide,
        difficulty: selectedDifficulty,
      });
    } else {
      api?.resetChessBoard?.(true, false);
    }
  };

  const handleOpenPauseModal = (settingsOnly = false) => {
    soundAndHaptics.playButtonClick();
    setSettingsOnlyModal(settingsOnly);
    setPauseModalOpen(true);
    if (matchStarted) {
      getEngineAPI()?.setGamePaused?.(true);
    }
  };

  const handleResumeMatch = () => {
    soundAndHaptics.playButtonClick();
    setPauseModalOpen(false);
    setSettingsOnlyModal(false);
    if (matchStarted) {
      getEngineAPI()?.setGamePaused?.(false);
    }
  };

  const handleReturnToMainMenu = () => {
    soundAndHaptics.playButtonClick();
    soundAndHaptics.setMatchAmbienceActive(false);
    setPauseModalOpen(false);
    setSettingsOnlyModal(false);
    setMatchStarted(false);
    setFeedbackBanner(null);
    getEngineAPI()?.setGamePaused?.(true);
    const checkmateOverlay = document.getElementById('checkmate-overlay');
    if (checkmateOverlay) checkmateOverlay.classList.remove('visible');
  };

  const handleUndoClick = () => {
    soundAndHaptics.playButtonClick();
    setPauseModalOpen(false);

    if (getEngineAPI()?.canUndo && !getEngineAPI()?.canUndo?.()) {
      showToast('Make a move on the board first to Undo.');
      return;
    }

    // Trigger Rewarded Ad (AdMob / Unity Ads with guaranteed fallback)
    launchUnityRewardedAd({
      adType: 'rewarded',
      placementId: UNITY_ADS_CONFIG.placements.rewarded,
      reason: 'undo',
      rewardTitle: 'Undo Move',
      durationSec: 5,
      onComplete: () => {
        setActiveAd(null);
        const res = getEngineAPI()?.undoFullRound?.();
        if (res?.ok) {
          showToast(
            selectedGameMode === 'local'
              ? '↺ Undo Applied · Last Move Reversed'
              : '↺ Undo Applied · Turn Reversed'
          );
        } else {
          showToast('Make a move on the board first to Undo.');
        }
      },
      onCancel: () => {
        setActiveAd(null);
      },
    });
  };

  const handleHintClick = () => {
    soundAndHaptics.playButtonClick();
    setPauseModalOpen(false);

    // Trigger Rewarded Ad (AdMob / Unity Ads with guaranteed fallback)
    launchUnityRewardedAd({
      adType: 'rewarded',
      placementId: UNITY_ADS_CONFIG.placements.rewarded,
      reason: 'hint',
      rewardTitle: 'Best Move Hint',
      durationSec: 5,
      onComplete: () => {
        setActiveAd(null);
        const res = getEngineAPI()?.showBestMoveHint?.();
        if (res?.ok && res.label) {
          showToast(`★ Best Move Hint: ${res.label}`, 6500);
        } else {
          showToast(res?.reason || 'No hint available right now.');
        }
      },
      onCancel: () => {
        setActiveAd(null);
      },
    });
  };

  const handleNewGame = () => {
    soundAndHaptics.playButtonClick();
    setPauseModalOpen(false);
    setSettingsOnlyModal(false);
    const checkmateOverlay = document.getElementById('checkmate-overlay');
    if (checkmateOverlay) checkmateOverlay.classList.remove('visible');

    resetStopwatch();
    getEngineAPI()?.startNewMatch?.({
      mode: selectedGameMode,
      side: selectedGameMode === 'local' ? 'w' : selectedSide,
      difficulty: selectedDifficulty,
    });
    setFeedbackBanner(null);
  };

  const handleCameraSelect = (preset: 'player' | 'top' | 'side' | 'wide') => {
    soundAndHaptics.playButtonClick();
    setActiveCamPreset(preset);
    getEngineAPI()?.setCameraPreset?.(preset);
  };

  const handleToggleSound = () => {
    const next = soundAndHaptics.updateSettings({
      soundEnabled: !audioSettings.soundEnabled,
    });
    setAudioSettings(next);
    if (next.soundEnabled) {
      soundAndHaptics.playButtonClick();
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    const clamped = Math.max(0, Math.min(100, newVolume));
    const next = soundAndHaptics.updateSettings({
      soundVolume: clamped,
      soundEnabled: clamped > 0 ? true : audioSettings.soundEnabled,
    });
    setAudioSettings(next);
  };

  const handleToggleHaptics = () => {
    const next = soundAndHaptics.updateSettings({
      hapticsEnabled: !audioSettings.hapticsEnabled,
    });
    setAudioSettings(next);
    if (next.hapticsEnabled) {
      soundAndHaptics.vibrate([25, 30, 40]);
    }
  };

  useEffect(() => {
    soundAndHaptics.setMatchAmbienceActive(matchStarted);
  }, [matchStarted]);

  useEffect(() => {
    soundAndHaptics.setAmbienceOverlayPaused(Boolean(activeAd));
  }, [activeAd]);

  const handleDifficultyChangeInSettings = (lvl: AIDifficultyLevel) => {
    soundAndHaptics.playButtonClick();
    setSelectedDifficulty(lvl);
    getEngineAPI()?.setAIDifficulty?.(lvl);
  };

  const handleGameModeChangeInSettings = (mode: ChessGameMode) => {
    soundAndHaptics.playButtonClick();
    setSelectedGameMode(mode);
    getEngineAPI()?.setGameMode?.(mode);
  };

  const isStopwatchRunning =
    matchStarted && !pauseModalOpen && !activeAd && !gameOver;

  return (
    <div
      id="landscape-stage"
      className={forceRotate90 ? 'force-landscape-rotate' : ''}
    >
      <div id="loading-overlay">
        <img
          src="/pwa-192x192.png"
          alt="Arcane Chess 3D Icon"
          className="loader-app-icon"
          referrerPolicy="no-referrer"
        />
        <div className="loader-title">Arcane Chess 3D</div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" id="loader-bar"></div>
        </div>
        <div id="loader-text">Summoning Sanctum Architecture &amp; Sculpted Pieces...</div>
      </div>

      <div id="canvas-container"></div>

      <OfflineIndicator />

      {feedbackBanner && (
        <div className="game-toast-banner" role="status" aria-live="polite">
          <span className="game-toast-text">{feedbackBanner}</span>
          <button
            type="button"
            className="game-toast-close"
            onClick={() => setFeedbackBanner(null)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Unity Rewarded Video Ad Player (BP_Rewarded_Android, Game ID 800410658) */}
      <UnityAdOverlay
        adRequest={activeAd}
        onFinishRewarded={() => {
          if (activeAd) {
            activeAd.onComplete();
          }
        }}
        onDismiss={() => {
          if (activeAd?.onCancel) {
            activeAd.onCancel();
          } else {
            setActiveAd(null);
          }
        }}
      />

      {/* =====================================================================
          ULTRA-MINIMAL GLASS START SCREEN (CLEAN PILLS, ZERO CLUTTER)
          ===================================================================== */}
      {!matchStarted && (
        <div className="minimal-start-backdrop" id="start-menu-overlay">
          <div className="minimal-start-card">
            {/* Clean Header: Title + Settings Gear */}
            <div className="minimal-start-header">
              <div className="minimal-brand-row">
                <img
                  src="/pwa-192x192.png"
                  alt="Arcane Chess 3D Dark Wizard Icon"
                  className="minimal-brand-app-icon"
                  referrerPolicy="no-referrer"
                />
                <h1 className="minimal-game-title">Arcane Chess 3D</h1>
              </div>
              <button
                type="button"
                className="minimal-icon-btn"
                id="btn-mainmenu-settings"
                onClick={() => handleOpenPauseModal(true)}
                aria-label="Settings"
                title="Settings"
              >
                ⚙
              </button>
            </div>

            {/* Clean Mode Selector Pill Row */}
            <div className="minimal-pill-group">
              <button
                type="button"
                className={`minimal-seg-btn ${selectedGameMode === 'single' ? 'active' : ''}`}
                id="btn-mode-ai"
                onClick={() => {
                  soundAndHaptics.playButtonClick();
                  setSelectedGameMode('single');
                }}
              >
                Player vs AI
              </button>
              <button
                type="button"
                className={`minimal-seg-btn ${selectedGameMode === 'local' ? 'active' : ''}`}
                id="btn-mode-pvp"
                onClick={() => {
                  soundAndHaptics.playButtonClick();
                  setSelectedGameMode('local');
                }}
              >
                Player vs Player
              </button>
            </div>

            {/* Clean AI Difficulty + Army Selector (or 2-Player Badge) */}
            {selectedGameMode === 'single' ? (
              <>
                <div className="minimal-pill-group three-col">
                  {(['beginner', 'professional', 'grandmaster'] as AIDifficultyLevel[]).map(
                    (lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        className={`minimal-seg-btn ${
                          selectedDifficulty === lvl ? 'active' : ''
                        }`}
                        onClick={() => {
                          soundAndHaptics.playButtonClick();
                          setSelectedDifficulty(lvl);
                        }}
                      >
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </button>
                    )
                  )}
                </div>

                <div className="minimal-pill-group">
                  <button
                    type="button"
                    className={`minimal-seg-btn ${selectedSide === 'w' ? 'active' : ''}`}
                    onClick={() => {
                      soundAndHaptics.playButtonClick();
                      setSelectedSide('w');
                    }}
                  >
                    ♔ White
                  </button>
                  <button
                    type="button"
                    className={`minimal-seg-btn ${selectedSide === 'b' ? 'active' : ''}`}
                    onClick={() => {
                      soundAndHaptics.playButtonClick();
                      setSelectedSide('b');
                    }}
                  >
                    ♚ Black
                  </button>
                </div>
              </>
            ) : (
              <div className="minimal-pvp-line">
                <span>♔ White</span>
                <span className="minimal-pvp-vs">VS</span>
                <span>♚ Black</span>
              </div>
            )}

            {/* Start Match CTA */}
            <button
              type="button"
              className="hud-btn primary minimal-start-btn"
              id="btn-start-match"
              onClick={handleStartMatch}
            >
              START MATCH
            </button>

            {/* Vantargo Company & Legal Links (Google Play Store Compliance) */}
            <div className="vantargo-start-footer">
              <span className="vantargo-brand-credit">&copy; Vantargo</span>
              <span className="vantargo-dot-sep">&middot;</span>
              <button
                type="button"
                className="vantargo-link-btn"
                onClick={() => {
                  soundAndHaptics.playButtonClick();
                  setLegalModalTab('privacy');
                }}
              >
                Privacy Policy
              </button>
              <span className="vantargo-dot-sep">&middot;</span>
              <button
                type="button"
                className="vantargo-link-btn"
                onClick={() => {
                  soundAndHaptics.playButtonClick();
                  setLegalModalTab('terms');
                }}
              >
                Terms
              </button>
              <span className="vantargo-dot-sep">&middot;</span>
              <button
                type="button"
                className="vantargo-link-btn"
                onClick={() => {
                  soundAndHaptics.playButtonClick();
                  setLegalModalTab('about');
                }}
              >
                About Us
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HUD (Visible only when match is started) */}
      <div id="hud-top" style={{ display: matchStarted ? 'flex' : 'none' }}>
        <div className="hud-group" id="hud-left">
          <div className="status-pill" id="status-pill">
            <span className="turn-dot" id="turn-dot"></span>
            <span id="turn-text">White to Move</span>
            <span className="mode-badge" id="mode-badge">
              {selectedGameMode === 'local'
                ? '2P Local'
                : `${selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)} AI`}
            </span>
          </div>
        </div>

        {/* Center Top: Premium 3D Sculpted Gold Chronometer Stopwatch (Isolated 1s tick) */}
        <ChronometerStopwatch running={isStopwatchRunning} resetSeed={stopwatchResetSeed} />

        {/* Right Top Pause & Settings Buttons */}
        <div className="hud-group" id="hud-right">
          <button
            type="button"
            className="hud-btn compact-3d-btn"
            id="btn-pause-match"
            onClick={() => handleOpenPauseModal(false)}
            title="Pause Match"
          >
            ⏸ Pause
          </button>
          <button
            type="button"
            className="hud-btn compact-3d-btn"
            id="btn-open-settings"
            onClick={() => handleOpenPauseModal(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>

        {/* Hidden compatibility buttons so engine DOM queries remain valid */}
        <div style={{ display: 'none' }} aria-hidden="true">
          <button type="button" id="btn-side-toggle">
            Play as Black
          </button>
          <button type="button" id="btn-ai-move">
            AI Move
          </button>
          <button type="button" id="btn-reset">
            New Game
          </button>
          <button type="button" id="btn-hide-ui">
            Hide UI
          </button>
        </div>
      </div>

      {/* BOTTOM LEFT & RIGHT SPLIT CONTROL DOCKS (Leaves bottom-center clear for Banner Ad) */}
      <div id="hud-bottom" style={{ display: matchStarted ? 'flex' : 'none' }}>
        {/* Left Side Control Dock: Undo [AD], Hint [AD], Flip */}
        <div className="android-bottom-bar hud-side-dock hud-side-left" id="controls-hint">
          <div className="android-quick-actions side-actions-left">
            <button
              type="button"
              className="hud-btn reward-btn compact-3d-btn"
              id="btn-undo"
              onClick={handleUndoClick}
              title="Watch Rewarded Video to Undo Move"
            >
              <span>Undo</span>
              <span className="ad-tag">AD</span>
            </button>

            <button
              type="button"
              className="hud-btn reward-btn compact-3d-btn"
              id="btn-hint"
              onClick={handleHintClick}
              title="Watch Rewarded Video for Best Move Hint"
            >
              <span>Hint</span>
              <span className="ad-tag">AD</span>
            </button>

            <button
              type="button"
              className="hud-btn compact-3d-btn cam-pill-btn"
              id="btn-flip-cam"
              onClick={() => handleCameraSelect(activeCamPreset)}
              title="Flip Camera"
            >
              Flip
            </button>
          </div>
        </div>

        {/* Right Side Control Dock: Camera Presets (Player, Top, Side, Wide) */}
        <div className="android-bottom-bar hud-side-dock hud-side-right" id="camera-controls-dock">
          <div className="android-quick-actions side-actions-right">
            <button
              type="button"
              className={`hud-btn compact-3d-btn cam-pill-btn ${
                activeCamPreset === 'player' ? 'active' : ''
              }`}
              id="btn-cam-player"
              onClick={() => handleCameraSelect('player')}
            >
              Player
            </button>

            <button
              type="button"
              className={`hud-btn compact-3d-btn cam-pill-btn ${
                activeCamPreset === 'top' ? 'active' : ''
              }`}
              id="btn-cam-top"
              onClick={() => handleCameraSelect('top')}
            >
              Top
            </button>

            <button
              type="button"
              className={`hud-btn compact-3d-btn cam-pill-btn ${
                activeCamPreset === 'side' ? 'active' : ''
              }`}
              id="btn-cam-side"
              onClick={() => handleCameraSelect('side')}
            >
              Side
            </button>

            <button
              type="button"
              className={`hud-btn compact-3d-btn cam-pill-btn ${
                activeCamPreset === 'wide' ? 'active' : ''
              }`}
              id="btn-cam-wide"
              onClick={() => handleCameraSelect('wide')}
            >
              Wide
            </button>
          </div>
        </div>

        <div className="captured-pill" id="captured-tray" style={{ display: 'none' }}></div>
      </div>

      {/* PAUSE & SETTINGS MODAL (CLEAN 2-BUTTON SOUND & HAPTICS) */}
      {pauseModalOpen && (
        <div
          className="pwa-modal-backdrop"
          onClick={handleResumeMatch}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <div
            className="pwa-modal-card pause-settings-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pwa-modal-header">
              <h2 className="pwa-modal-title" id="pause-modal-title">
                {matchStarted && !settingsOnlyModal ? 'Paused' : 'Settings'}
              </h2>
              <button
                type="button"
                className="pwa-modal-close"
                onClick={handleResumeMatch}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="pwa-modal-body">
              {matchStarted && (
                <div className="pause-action-grid">
                  <button
                    type="button"
                    className="hud-btn primary pause-action-btn"
                    id="btn-resume-match"
                    onClick={handleResumeMatch}
                  >
                    ▶ Resume
                  </button>

                  <button
                    type="button"
                    className="hud-btn pause-action-btn"
                    id="btn-pause-newgame"
                    onClick={handleNewGame}
                  >
                    ↻ New Game
                  </button>

                  <button
                    type="button"
                    className="hud-btn pause-action-btn"
                    id="btn-pause-mainmenu"
                    onClick={handleReturnToMainMenu}
                  >
                    ⌂ Menu
                  </button>
                </div>
              )}

              {/* Clean 2-Button Sound ON/OFF & Haptic ON/OFF */}
              <div className="simple-audio-grid">
                <button
                  type="button"
                  className={`hud-btn simple-toggle-btn ${
                    audioSettings.soundEnabled ? 'active' : ''
                  }`}
                  id="btn-toggle-sound"
                  onClick={handleToggleSound}
                >
                  {audioSettings.soundEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF'}
                </button>

                <button
                  type="button"
                  className={`hud-btn simple-toggle-btn ${
                    audioSettings.hapticsEnabled ? 'active' : ''
                  }`}
                  id="btn-toggle-haptics"
                  onClick={handleToggleHaptics}
                >
                  {audioSettings.hapticsEnabled ? '📳 Haptic: ON' : '📴 Haptic: OFF'}
                </button>
              </div>

              {/* Dynamic Volume Slider (Scales Gregorian Chanting, Cathedral Echoes & SFX) */}
              <div className="cathedral-volume-control">
                <div className="cathedral-volume-header">
                  <span className="cathedral-volume-label">
                    🏛 Cathedral Chant &amp; SFX Volume
                  </span>
                  <span className="cathedral-volume-value">
                    {audioSettings.soundEnabled ? `${audioSettings.soundVolume}%` : 'Muted'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={audioSettings.soundEnabled ? audioSettings.soundVolume : 0}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="cathedral-volume-slider"
                  id="slider-sound-volume"
                  aria-label="Cathedral Chant and Sound Effects Volume"
                />
              </div>

              {matchStarted && (
                <div className="minimal-pill-group">
                  <button
                    type="button"
                    className={`minimal-seg-btn ${selectedGameMode === 'single' ? 'active' : ''}`}
                    onClick={() => handleGameModeChangeInSettings('single')}
                  >
                    Player vs AI
                  </button>
                  <button
                    type="button"
                    className={`minimal-seg-btn ${selectedGameMode === 'local' ? 'active' : ''}`}
                    onClick={() => handleGameModeChangeInSettings('local')}
                  >
                    Player vs Player
                  </button>
                </div>
              )}

              {matchStarted && selectedGameMode === 'single' && (
                <div className="minimal-pill-group three-col">
                  {(['beginner', 'professional', 'grandmaster'] as AIDifficultyLevel[]).map(
                    (lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        className={`minimal-seg-btn ${
                          selectedDifficulty === lvl ? 'active' : ''
                        }`}
                        onClick={() => handleDifficultyChangeInSettings(lvl)}
                      >
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </button>
                    )
                  )}
                </div>
              )}

              {/* Vantargo Legal & Company Info Row inside Settings */}
              <div className="minimal-pill-group three-col vantargo-settings-legal">
                <button
                  type="button"
                  className="minimal-seg-btn"
                  onClick={() => {
                    soundAndHaptics.playButtonClick();
                    setLegalModalTab('privacy');
                  }}
                >
                  Privacy Policy
                </button>
                <button
                  type="button"
                  className="minimal-seg-btn"
                  onClick={() => {
                    soundAndHaptics.playButtonClick();
                    setLegalModalTab('terms');
                  }}
                >
                  Terms &amp; Conditions
                </button>
                <button
                  type="button"
                  className="minimal-seg-btn"
                  onClick={() => {
                    soundAndHaptics.playButtonClick();
                    setLegalModalTab('about');
                  }}
                >
                  About Vantargo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vantargo Privacy Policy, Terms & Conditions, and About Us Modal */}
      <VantargoLegalModal
        activeTab={legalModalTab}
        onSelectTab={(tab) => setLegalModalTab(tab)}
        onClose={() => setLegalModalTab(null)}
      />

      <div id="checkmate-overlay" role="status" aria-live="polite">
        {/* Celebratory Victory Flair Sparkles & Golden Rays (Shown on Win) */}
        <div className="victory-flair-layer" aria-hidden="true">
          <div className="victory-flair-halo"></div>
          <span className="victory-spark s1">✦</span>
          <span className="victory-spark s2">★</span>
          <span className="victory-spark s3">✦</span>
          <span className="victory-spark s4">✧</span>
          <span className="victory-spark s5">★</span>
          <span className="victory-spark s6">✦</span>
          <span className="victory-spark s7">✧</span>
          <span className="victory-spark s8">★</span>
        </div>
        <div className="checkmate-banner">
          <div className="checkmate-ornament">✦ &nbsp; Sanctum Judgment &nbsp; ✦</div>
          <div className="checkmate-crown" id="checkmate-crown">
            ♔
          </div>
          <div className="checkmate-title" id="checkmate-title">
            Checkmate
          </div>
          <div className="checkmate-rule"></div>
          <div className="checkmate-subtitle" id="checkmate-subtitle">
            White Triumphs • The Black King Has Fallen
          </div>
          <div className="checkmate-actions">
            <button className="checkmate-btn" id="btn-checkmate-replay">
              Replay King Fall
            </button>
            <button
              className="checkmate-btn"
              id="btn-checkmate-newgame"
              onClick={(e) => {
                e.stopPropagation();
                handleNewGame();
              }}
            >
              New Game
            </button>
            <button
              className="checkmate-btn secondary"
              id="btn-checkmate-mainmenu"
              onClick={(e) => {
                e.stopPropagation();
                handleReturnToMainMenu();
              }}
            >
              Main Menu
            </button>
            <button className="checkmate-btn secondary" id="btn-checkmate-dismiss">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
