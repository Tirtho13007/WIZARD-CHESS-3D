// Official Unity Ads SDK 4.x Configuration & Native Android Bridge
// Reference: https://docs.unity.com/en-us/grow/ads/unity-sdk/rewarded-ads

export const UNITY_ADS_CONFIG = {
  appName: 'WIZARD CHESS 3D',
  gameId: '800410658',
  organizationCoreId: '18968528237818',
  testMode: false,
  placements: {
    rewarded: 'BP_Rewarded_Android',
  },
} as const;

export type UnityAdType = 'rewarded';
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
  isInitialized?: () => boolean;
  load?: (adUnitId: string) => void;
  show?: (adUnitId: string) => void;
  showRewardedAd?: (adUnitId: string) => void;
}

declare global {
  interface Window {
    UnityAds?: NativeAndroidUnityBridge;
    AndroidUnityAds?: NativeAndroidUnityBridge;
    Android?: NativeAndroidUnityBridge;
    unityAdsBridge?: NativeAndroidUnityBridge;
    // Unity Ads SDK 4.x IUnityAdsInitializationListener callbacks
    onUnityAdsInitializationComplete?: () => void;
    onUnityAdsInitializationFailed?: (error: string, message: string) => void;
    // Unity Ads SDK 4.x IUnityAdsLoadListener callbacks
    onUnityAdsAdLoaded?: (adUnitId: string) => void;
    onUnityAdsFailedToLoad?: (adUnitId: string, error: string, message: string) => void;
    // Unity Ads SDK 4.x IUnityAdsShowListener callbacks
    onUnityAdsShowStart?: (adUnitId: string) => void;
    onUnityAdsShowClick?: (adUnitId: string) => void;
    onUnityAdsShowFailure?: (adUnitId: string, error: string, message: string) => void;
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
 * Initializes the Unity Ads SDK 4.x bridge (`IUnityAdsInitializationListener` + `IUnityAdsLoadListener`)
 * and preloads `BP_Rewarded_Android` for Game ID `800410658` with `testMode = false`.
 */
export function initUnityAdsBridge(): void {
  if (typeof window === 'undefined') return;

  window.onUnityAdsInitializationComplete = () => {
    const bridge = getNativeBridge();
    bridge?.load?.(UNITY_ADS_CONFIG.placements.rewarded);
  };

  window.onUnityAdsAdLoaded = (adUnitId: string) => {
    loadedPlacements.add(adUnitId);
  };

  window.onUnityAdsFailedToLoad = (adUnitId: string) => {
    loadedPlacements.delete(adUnitId);
  };

  const nativeBridge = getNativeBridge();
  if (nativeBridge?.initialize) {
    try {
      nativeBridge.initialize(UNITY_ADS_CONFIG.gameId, UNITY_ADS_CONFIG.testMode);
      nativeBridge.load?.(UNITY_ADS_CONFIG.placements.rewarded);
    } catch {
      // Fallback to Rewarded Video Player when running in standard browser
    }
  }
}

/**
 * Displays a Rewarded Video Ad via the native Android Unity Ads SDK 4.x
 * (`UnityAds.show(activity, "BP_Rewarded_Android", UnityAdsShowOptions(), showListener)`).
 * Returns true if the native Android SDK handled the call, or false if running in a web browser.
 */
export function tryShowNativeUnityAd(request: ActiveUnityAdRequest): boolean {
  if (typeof window === 'undefined') return false;
  const nativeBridge = getNativeBridge();
  if (!nativeBridge) return false;

  try {
    const handleShowComplete = (
      adUnitId: string,
      state: 'COMPLETED' | 'SKIPPED' | 'ERROR'
    ) => {
      if (adUnitId && adUnitId !== request.placementId) return;
      // Reload placement for next use per Unity Ads SDK 4.x documentation
      nativeBridge.load?.(request.placementId);

      // Grant the reward ONLY when state === UnityAdsShowCompletionState.COMPLETED
      if (state === 'COMPLETED') {
        request.onComplete();
      } else {
        request.onCancel?.();
      }
    };

    window.onUnityAdsShowComplete = (adUnitId, state) =>
      handleShowComplete(adUnitId, state);
    window.onUnityAdsDidFinish = (adUnitId, state) =>
      handleShowComplete(adUnitId, state);
    window.onUnityAdsShowFailure = (adUnitId) =>
      handleShowComplete(adUnitId, 'ERROR');

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
