import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from './usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="pwa-offline-toast" role="status" aria-live="polite">
      <span className="pwa-offline-dot" />
      <span>Offline Mode — 3D Assets Cached</span>
    </div>
  );
};

interface PWAInstallButtonProps {
  onActionComplete?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  onActionComplete,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (onActionComplete) onActionComplete();
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {isInstallable && (
        <button
          type="button"
          className="hud-btn primary pwa-hud-btn"
          id="btn-pwa-install"
          onClick={handleInstallClick}
          title="Install Arcane Chess 3D"
        >
          Install App
        </button>
      )}

      {!isInstallable && isIOS && (
        <button
          type="button"
          className="hud-btn primary pwa-hud-btn"
          id="btn-pwa-ios-install"
          onClick={() => {
            if (onActionComplete) onActionComplete();
            setShowIOSGuide(true);
          }}
          title="Install Arcane Chess 3D on iOS"
        >
          Install on iOS
        </button>
      )}

      {showIOSGuide && (
        <div
          className="pwa-modal-backdrop"
          onClick={() => setShowIOSGuide(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-guide-title"
        >
          <div className="pwa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-modal-header">
              <span className="pwa-modal-title" id="ios-guide-title">
                Install Arcane Chess 3D
              </span>
              <button
                type="button"
                className="pwa-modal-close"
                onClick={() => setShowIOSGuide(false)}
              >
                ✕
              </button>
            </div>
            <div className="pwa-modal-body">
              <p className="pwa-modal-desc">
                1. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.<br />
                3. Launch <strong>Arcane Chess 3D</strong> in full-screen mode.
              </p>
              <button
                type="button"
                className="hud-btn primary"
                onClick={() => setShowIOSGuide(false)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
