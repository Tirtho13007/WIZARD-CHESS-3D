// Official Google AdMob + Unity Ads SDK 4.x Configuration & Native Android Bridge

export const UNITY_ADS_CONFIG = {
  appName: 'WIZARD CHESS 3D',
  gameId: '800410658',
  organizationCoreId: '18968528237818',
  testMode: false,
  placements: {
    rewarded: 'BP_Rewarded_Android',
  },
  admob: {
    publisherId: 'pub-1151788930010230',
    bannerUnitId: 'ca-app-pub-1151788930010230/3860898466',
    interstitialUnitId: 'ca-app-pub-1151788930010230/9269223538',
    rewardedUnitId: 'ca-app-pub-1151788930010230/6643060191',
  },
} as const;

export type UnityAdType = 'rewarded' | 'interstitial';
export type RewardReason = 'undo' | 'hint';

// Matches UnityAds.UnityAdsShowCompletionState from Unity Ads SDK 4.x
export type UnityAdsShowCompletionState = 'COMPLETED' | 'SKIPPED';

export interface ActiveUnityAdRequest {
  adType: UnityAdType;
  placementId: string;
  reason: RewardReason;
  rewardTitle: string;
  durationSec: number;
  onComplete: () => void;
  onCancel?: () => void;
}

interface NativeAndroidUnityBridge {
  initialize?: (gameId: string, testMode: boolean) => void;
  setAdMobUnitIds?: (bannerId: string, interstitialId: string, rewardedId: string) => void;
  setAdMobRewardedUnitId?: (unitId: string) => void;
  isInitialized?: () => boolean;
  isAdReady?: (adUnitId: string) => boolean;
  load?: (adUnitId: string) => void;
  show?: (adUnitId: string) => void;
  showRewardedAd?: (adUnitId: string) => void;
  showInterstitialAd?: () => void;
}

declare global {
  interface Window {
    UnityAds?: NativeAndroidUnityBridge;
    AndroidUnityAds?: NativeAndroidUnityBridge;
    Android?: NativeAndroidUnityBridge;
    unityAdsBridge?: NativeAndroidUnityBridge;
    // AdMob / Unity Ads initialization callbacks
    onUnityAdsInitializationComplete?: () => void;
    onUnityAdsInitializationFailed?: (error: string, message: string) => void;
    // AdMob / Unity Ads load callbacks
    onUnityAdsAdLoaded?: (adUnitId: string) => void;
    onUnityAdsFailedToLoad?: (adUnitId: string, error: string, message: string) => void;
    // AdMob / Unity Ads show callbacks
    onUnityAdsShowStart?: (adUnitId: string) => void;
    onUnityAdsShowClick?: (adUnitId: string) => void;
    onUnityAdsShowFailure?: (adUnitId: string, error: string, message: string) => void;
    onUnityAdsFallbackToOverlay?: (adUnitId: string) => void;
    onUnityAdsShowComplete?: (
      adUnitId: string,
      state: UnityAdsShowCompletionState
    ) => void;
    // Legacy Unity Ads 3.x fallback callback
    onUnityAdsDidFinish?: (
      adUnitId: string,
      state: 'COMPLETED' | 'SKIPPED' | 'ERROR'
    ) => void;
  }
}

const loadedPlacements = new Set<string>();

function getNativeBridge(): NativeAndroidUnityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.UnityAds ||
    window.AndroidUnityAds ||
    window.Android ||
    window.unityAdsBridge
  );
}

/**
 * Initializes the Native Android Google AdMob + Unity Ads SDK bridge and preloads
 * Banner (`ca-app-pub-1151788930010230/3860898466`),
 * Interstitial (`ca-app-pub-1151788930010230/9269223538`), and
 * Rewarded (`ca-app-pub-1151788930010230/6643060191`) ads.
 */
export function initUnityAdsBridge(): void {
  if (typeof window === 'undefined') return;

  window.onUnityAdsInitializationComplete = () => {
    const bridge = getNativeBridge();
    bridge?.load?.(UNITY_ADS_CONFIG.placements.rewarded);
  };

  window.onUnityAdsAdLoaded = (adUnitId: string) => {
    loadedPlacements.add(adUnitId || UNITY_ADS_CONFIG.placements.rewarded);
  };

  window.onUnityAdsFailedToLoad = (adUnitId: string) => {
    loadedPlacements.delete(adUnitId || UNITY_ADS_CONFIG.placements.rewarded);
  };

  const nativeBridge = getNativeBridge();
  if (nativeBridge?.initialize) {
    try {
      if (nativeBridge.setAdMobUnitIds) {
        nativeBridge.setAdMobUnitIds(
          UNITY_ADS_CONFIG.admob.bannerUnitId,
          UNITY_ADS_CONFIG.admob.interstitialUnitId,
          UNITY_ADS_CONFIG.admob.rewardedUnitId
        );
      } else if (nativeBridge.setAdMobRewardedUnitId) {
        nativeBridge.setAdMobRewardedUnitId(UNITY_ADS_CONFIG.admob.rewardedUnitId);
      }
      nativeBridge.initialize(UNITY_ADS_CONFIG.gameId, UNITY_ADS_CONFIG.testMode);
      nativeBridge.load?.(UNITY_ADS_CONFIG.placements.rewarded);
    } catch {
      // Fallback to Rewarded Video Player when running in standard browser
    }
  }
}

/**
 * Displays a Rewarded Video Ad via Native Android Google AdMob (`ca-app-pub-1151788930010230/6643060191`)
 * or Unity Ads (`BP_Rewarded_Android`).
 * If no native ad fill is ready (e.g. on Emulator or before Play Store verification),
 * automatically triggers `onFallbackToOverlay` so the built-in 5-second Rewarded Video Ad
 * plays and the user ALWAYS receives their Hint or Undo reward.
 */
export function tryShowNativeUnityAd(
  request: ActiveUnityAdRequest,
  onFallbackToOverlay: () => void
): boolean {
  if (typeof window === 'undefined') return false;
  const nativeBridge = getNativeBridge();
  if (!nativeBridge) return false;

  try {
    // Check if native AdMob or Unity Ad is actually loaded & ready before calling show()
    if (typeof nativeBridge.isAdReady === 'function') {
      const ready = nativeBridge.isAdReady(request.placementId);
      if (!ready) {
        nativeBridge.load?.(request.placementId);
        return false; // Let caller immediately open the 5-second Rewarded Video Overlay
      }
    }

    let handled = false;
    const finishOnce = (action: () => void) => {
      if (handled) return;
      handled = true;
      action();
    };

    const handleShowComplete = (
      adUnitId: string,
      state: 'COMPLETED' | 'SKIPPED' | 'ERROR'
    ) => {
      if (adUnitId && adUnitId !== request.placementId) return;
      nativeBridge.load?.(request.placementId);

      if (state === 'COMPLETED') {
        finishOnce(() => request.onComplete());
      } else if (state === 'ERROR') {
        // Native ad failed to display (e.g., NO_FILL on emulator) -> fallback to in-game video ad!
        finishOnce(() => onFallbackToOverlay());
      } else {
        finishOnce(() => request.onCancel?.());
      }
    };

    window.onUnityAdsShowComplete = (adUnitId, state) =>
      handleShowComplete(adUnitId, state);
    window.onUnityAdsDidFinish = (adUnitId, state) =>
      handleShowComplete(adUnitId, state);
    window.onUnityAdsShowFailure = (adUnitId) =>
      handleShowComplete(adUnitId, 'ERROR');
    window.onUnityAdsFallbackToOverlay = () => {
      nativeBridge.load?.(request.placementId);
      finishOnce(() => onFallbackToOverlay());
    };

    if (nativeBridge.showRewardedAd) {
      nativeBridge.showRewardedAd(request.placementId);
      return true;
    }
    if (nativeBridge.show) {
      nativeBridge.show(request.placementId);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Triggers the user's Google AdMob Interstitial Ad (`ca-app-pub-1151788930010230/9269223538`)
 * on Android if loaded.
 */
export function tryShowNativeInterstitialAd(): void {
  if (typeof window === 'undefined') return;
  const nativeBridge = getNativeBridge();
  try {
    nativeBridge?.showInterstitialAd?.();
  } catch {
    // Non-blocking
  }
}
