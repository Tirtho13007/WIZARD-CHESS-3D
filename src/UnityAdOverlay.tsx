import React, { useEffect, useRef, useState } from 'react';
import { ActiveUnityAdRequest } from './unityAdsManager';
import { soundAndHaptics } from './soundAndHaptics';

interface UnityAdOverlayProps {
  adRequest: ActiveUnityAdRequest | null;
  onFinishRewarded: () => void;
  onDismiss: () => void;
}

export const UnityAdOverlay: React.FC<UnityAdOverlayProps> = ({
  adRequest,
  onFinishRewarded,
  onDismiss,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [completed, setCompleted] = useState(false);
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoCompletedRef = useRef(false);

  useEffect(() => {
    if (!adRequest) return;
    setSecondsLeft(adRequest.durationSec);
    setCompleted(false);
    autoCompletedRef.current = false;

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          setCompleted(true);
          if (!muted) {
            soundAndHaptics.playRewardUnlocked();
          }
          // Automatically grant the reward (Undo or Hint) when countdown reaches 0
          if (!autoCompletedRef.current) {
            autoCompletedRef.current = true;
            window.setTimeout(() => {
              onFinishRewarded();
            }, 350);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [adRequest]);

  // Full-Screen 60FPS Rewarded Video Stream Canvas
  useEffect(() => {
    if (!adRequest) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const startTime = performance.now();

    const resizeCanvas = () => {
      const w = Math.max(window.innerWidth, window.innerHeight);
      const h = Math.min(window.innerWidth, window.innerHeight);
      canvas.width = w;
      canvas.height = h;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const particles = Array.from({ length: 50 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      speed: 0.08 + (i % 5) * 0.03,
      size: 1.4 + (i % 3) * 1.2,
    }));

    const renderFrame = (now: number) => {
      const t = (now - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // 1. Deep cinematic video backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, '#060a14');
      bgGrad.addColorStop(0.5, '#111a2e');
      bgGrad.addColorStop(1, '#090d18');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Animated radial spotlight
      const cx = w * 0.5;
      const cy = h * 0.48;
      const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(w, h) * 0.48);
      glow.addColorStop(0, 'rgba(245, 215, 110, 0.28)');
      glow.addColorStop(0.5, 'rgba(212, 175, 55, 0.08)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // 3. Moving 3D perspective floor grid
      const horizonY = h * 0.64;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizonY, w, h - horizonY);
      ctx.clip();
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.22)';
      ctx.lineWidth = 1.2;
      for (let i = -9; i <= 9; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 30, horizonY);
        ctx.lineTo(cx + i * 150, h);
        ctx.stroke();
      }
      const scroll = (t * 1.6) % 1;
      for (let r = 0; r < 7; r++) {
        const p = (r + scroll) / 7;
        const y = horizonY + Math.pow(p, 1.65) * (h - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();

      // 4. Floating golden particles
      for (const p of particles) {
        const px = ((p.x + Math.sin(t + p.y * 6) * 0.02 + 1) % 1) * w;
        const py = ((1 - ((p.y + t * p.speed) % 1)) * 0.9 + 0.05) * h;
        ctx.fillStyle = 'rgba(245, 215, 110, 0.65)';
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Center animated 3D reward ring & chess piece showcase
      for (let ring = 0; ring < 3; ring++) {
        const pulse = (t * 0.5 + ring * 0.33) % 1;
        const radius = 44 + pulse * Math.min(w, h) * 0.24;
        ctx.strokeStyle = `rgba(245, 215, 110, ${(1 - pulse) * 0.45})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(cx, cy + Math.sin(t * 2.5) * 4);
      ctx.fillStyle = 'rgba(12, 16, 28, 0.9)';
      ctx.strokeStyle = '#f5d76e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff6d6';
      ctx.font = 'bold 46px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(adRequest.reason === 'undo' ? '↺' : '★', 0, 2);
      ctx.restore();

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [adRequest]);

  if (!adRequest) return null;

  const totalSec = Math.max(1, adRequest.durationSec);
  const progressFraction = Math.min(1, Math.max(0, (totalSec - secondsLeft) / totalSec));
  const ringRadius = 16;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = ringCircumference * (1 - progressFraction);

  const handleCompleteAndClose = () => {
    if (autoCompletedRef.current) return;
    autoCompletedRef.current = true;
    soundAndHaptics.playButtonClick();
    onFinishRewarded();
  };

  return (
    <div
      className="unity-fullscreen-ad"
      role="dialog"
      aria-modal="true"
      aria-label="Rewarded Video Ad"
    >
      <canvas ref={canvasRef} className="unity-fullscreen-canvas" />

      {/* Top Bar: Sound Toggle + Circular Countdown / Close */}
      <div className="unity-fullscreen-topbar">
        <div className="unity-top-left-controls">
          <button
            type="button"
            className="unity-icon-circle-btn"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute Video' : 'Mute Video'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="unity-sponsored-badge">
            <span className="unity-logo-hex">▶</span>
            <span>Rewarded Video · {adRequest.rewardTitle}</span>
          </div>
        </div>

        <div className="unity-top-right-controls">
          {!completed ? (
            <div className="unity-countdown-ring-wrap" title={`Reward in ${secondsLeft}s`}>
              <svg width="42" height="42" viewBox="0 0 42 42" className="unity-countdown-svg">
                <circle
                  cx="21"
                  cy="21"
                  r={ringRadius}
                  fill="rgba(0,0,0,0.65)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="3"
                />
                <circle
                  cx="21"
                  cy="21"
                  r={ringRadius}
                  fill="none"
                  stroke="#f5d76e"
                  strokeWidth="3"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 21 21)"
                />
              </svg>
              <span className="unity-countdown-number">{secondsLeft}</span>
            </div>
          ) : (
            <button
              type="button"
              className="unity-close-complete-btn"
              id="btn-unity-claim-reward"
              onClick={handleCompleteAndClose}
              aria-label="Close Video and Apply Reward"
            >
              ✕
            </button>
          )}

          {!completed && (
            <button
              type="button"
              className="unity-early-skip-btn"
              onClick={() => {
                soundAndHaptics.playButtonClick();
                onDismiss();
              }}
              title="Skip Video"
              aria-label="Skip Video"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Bottom Video Progress Bar */}
      <div className="unity-video-progress-strip">
        <div className="unity-video-status-line">
          <span>
            {completed
              ? `✓ ${adRequest.rewardTitle} Unlocked`
              : `Unlocking ${adRequest.rewardTitle} in ${secondsLeft}s...`}
          </span>
        </div>
        <div className="unity-video-progress-track">
          <div
            className="unity-video-progress-fill"
            style={{ width: `${Math.round(progressFraction * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
