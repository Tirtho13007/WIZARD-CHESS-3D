import React from 'react';
import { soundAndHaptics } from './soundAndHaptics';

export type LegalTabType = 'privacy' | 'terms' | 'about';

interface VantargoLegalModalProps {
  activeTab: LegalTabType | null;
  onSelectTab: (tab: LegalTabType) => void;
  onClose: () => void;
}

export const VantargoLegalModal: React.FC<VantargoLegalModalProps> = ({
  activeTab,
  onSelectTab,
  onClose,
}) => {
  if (!activeTab) return null;

  const handleTabSwitch = (tab: LegalTabType) => {
    soundAndHaptics.playButtonClick();
    onSelectTab(tab);
  };

  const handleClose = () => {
    soundAndHaptics.playButtonClick();
    onClose();
  };

  return (
    <div
      className="pwa-modal-backdrop legal-modal-backdrop"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vantargo-legal-title"
    >
      <div
        className="pwa-modal-card vantargo-legal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pwa-modal-header">
          <div className="vantargo-header-brand">
            <span className="vantargo-badge">VANTARGO</span>
            <h2 className="pwa-modal-title" id="vantargo-legal-title">
              {activeTab === 'privacy'
                ? 'Privacy Policy'
                : activeTab === 'terms'
                ? 'Terms & Conditions'
                : 'About Us · Vantargo'}
            </h2>
          </div>
          <button
            type="button"
            className="pwa-modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Clean 3-Tab Switcher */}
        <div className="minimal-pill-group three-col vantargo-tab-bar">
          <button
            type="button"
            className={`minimal-seg-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('privacy')}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            className={`minimal-seg-btn ${activeTab === 'terms' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('terms')}
          >
            Terms &amp; Conditions
          </button>
          <button
            type="button"
            className={`minimal-seg-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('about')}
          >
            About Us
          </button>
        </div>

        {/* Scrollable Legal / Company Content */}
        <div className="vantargo-legal-scroll">
          {activeTab === 'privacy' && (
            <div className="vantargo-legal-section">
              <p className="vantargo-legal-updated">
                Effective Date: October 26, 2026 · Publisher: <strong>Vantargo</strong>
              </p>
              <p>
                <strong>Vantargo</strong> (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy. This
                Privacy Policy explains how information is handled when you play{' '}
                <strong>WIZARD CHESS 3D</strong> on Android or web platforms.
              </p>

              <h3>1. Personal Data We Do Not Collect</h3>
              <p>
                WIZARD CHESS 3D does not require user registration or login. We do not collect,
                store, or share your personal name, phone number, contacts, camera, microphone, or
                precise GPS location.
              </p>

              <h3>2. Local Device Storage</h3>
              <p>
                Game settings (such as Sound ON/OFF, Haptic Vibration ON/OFF, and AI Difficulty
                preferences) are saved locally on your device solely to preserve your gameplay
                experience.
              </p>

              <h3>3. Third-Party Advertising (Google AdMob)</h3>
              <p>
                WIZARD CHESS 3D displays Banner, Interstitial, and Rewarded Video advertisements
                (used to unlock optional in-game features such as <em>Undo Move</em> and{' '}
                <em>Best Move Hint</em>) via <strong>Google AdMob</strong>. Google AdMob may
                automatically collect and process:
              </p>
              <ul>
                <li>Your device&apos;s Android Advertising ID (AAID)</li>
                <li>Coarse IP-based location and device model/OS version</li>
                <li>Ad impression, click, and crash diagnostic metrics</li>
              </ul>
              <p>
                You can reset or opt out of personalized advertising at any time in your Android
                device settings under <strong>Settings &rarr; Google &rarr; Ads</strong>. Learn
                more at{' '}
                <span className="vantargo-highlight-text">
                  https://policies.google.com/privacy
                </span>
                .
              </p>

              <h3>4. Children&apos;s Privacy</h3>
              <p>
                Our game is a general-audience classical board game and does not knowingly collect
                personal information from children under the age of 13.
              </p>

              <h3>5. Contact Vantargo</h3>
              <p>
                If you have any questions about this Privacy Policy, please contact{' '}
                <strong>Vantargo</strong> at:{' '}
                <span className="vantargo-highlight-text">
                  hello.mahbuburrahman1@gmail.com
                </span>
              </p>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="vantargo-legal-section">
              <p className="vantargo-legal-updated">
                Last Updated: October 26, 2026 · Company: <strong>Vantargo</strong>
              </p>
              <p>
                By installing, accessing, or playing <strong>WIZARD CHESS 3D</strong>, you agree to
                these Terms &amp; Conditions established by <strong>Vantargo</strong>.
              </p>

              <h3>1. License to Play</h3>
              <p>
                <strong>Vantargo</strong> grants you a personal, non-exclusive, non-transferable,
                revocable license to use WIZARD CHESS 3D strictly for personal, non-commercial
                entertainment.
              </p>

              <h3>2. Intellectual Property Rights</h3>
              <p>
                All 3D cathedral environments, sculpted chess statues, combat animations, user
                interface designs, audio synthesis, source code, and trademarks associated with{' '}
                <strong>WIZARD CHESS 3D</strong> are owned by or licensed to{' '}
                <strong>Vantargo</strong>. You may not reverse-engineer, decompile, or redistribute
                the application APK/AAB.
              </p>

              <h3>3. Rewarded Video Ads &amp; In-Game Features</h3>
              <p>
                Features such as <em>Undo Move</em> and <em>Best Move Hint</em> are unlocked by
                watching optional Rewarded Video advertisements served by Google AdMob. Any attempt
                to generate invalid clicks, use automated bots, or manipulate ad impressions is
                strictly prohibited.
              </p>

              <h3>4. Disclaimer of Warranties &amp; Liability</h3>
              <p>
                WIZARD CHESS 3D is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis.{' '}
                <strong>Vantargo</strong> shall not be liable for any indirect, incidental, or
                consequential damages arising from your use of the game.
              </p>

              <h3>5. Contact Information</h3>
              <p>
                For support or legal inquiries regarding WIZARD CHESS 3D, contact{' '}
                <strong>Vantargo</strong> at:{' '}
                <span className="vantargo-highlight-text">
                  hello.mahbuburrahman1@gmail.com
                </span>
              </p>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="vantargo-legal-section vantargo-about-box">
              <div className="vantargo-about-hero">
                <div className="vantargo-about-crest">♔</div>
                <div>
                  <h3 className="vantargo-about-game">WIZARD CHESS 3D</h3>
                  <p className="vantargo-about-sub">
                    Developed &amp; Published by <strong>Vantargo</strong> · Version 1.3.0
                  </p>
                </div>
              </div>

              <p>
                <strong>Vantargo</strong> is an interactive digital entertainment and game
                development studio dedicated to crafting atmospheric, high-craft 3D strategy and
                board games for Android and modern platforms.
              </p>

              <div className="vantargo-info-grid">
                <div className="vantargo-info-item">
                  <span className="vantargo-info-label">Company Name</span>
                  <span className="vantargo-info-val">Vantargo</span>
                </div>
                <div className="vantargo-info-item">
                  <span className="vantargo-info-label">Application</span>
                  <span className="vantargo-info-val">WIZARD CHESS 3D</span>
                </div>
                <div className="vantargo-info-item">
                  <span className="vantargo-info-label">Package ID</span>
                  <span className="vantargo-info-val">com.wizardchess3d.sanctum</span>
                </div>
                <div className="vantargo-info-item">
                  <span className="vantargo-info-label">Official Support</span>
                  <span className="vantargo-info-val">hello.mahbuburrahman1@gmail.com</span>
                </div>
              </div>

              <p className="vantargo-copyright-note">
                &copy; {new Date().getFullYear()} <strong>Vantargo</strong>. All Rights Reserved.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
