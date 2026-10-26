package com.wizardchess3d.sanctum;

import android.annotation.SuppressLint;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsShowOptions;
import com.unity3d.services.banners.BannerErrorInfo;
import com.unity3d.services.banners.BannerView;
import com.unity3d.services.banners.UnityBannerSize;

import java.util.HashSet;
import java.util.Set;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "WizardChessAds";

    // Strictly 100% User's Production Google AdMob Ad Unit IDs
    private static String PROD_BANNER_UNIT_ID = "ca-app-pub-1151788930010230/3860898466";
    private static String PROD_INTERSTITIAL_UNIT_ID = "ca-app-pub-1151788930010230/9269223538";
    private static String PROD_REWARDED_UNIT_ID = "ca-app-pub-1151788930010230/6643060191";

    // User's Unity Ads Game ID & Exact Placement IDs from Unity Dashboard
    private static String UNITY_GAME_ID = "800410658";
    private static boolean UNITY_TEST_MODE = false;
    private static final String UNITY_BANNER_PRIMARY = "BP_Banner_Android";
    private static final String UNITY_INTERSTITIAL_PRIMARY = "BP_Interstitial_Android";
    private static final String UNITY_REWARDED_PRIMARY = "BP_Rewarded_Android";
    private static final String UNITY_REWARDED_DEFAULT = "Rewarded_Android";
    private static final String UNITY_INTERSTITIAL_DEFAULT = "Interstitial_Android";

    private WebView webView;
    private FrameLayout rootLayout;
    private AdView admobBannerView = null;
    private BannerView unityBannerView = null;
    private RewardedAd admobRewardedAd = null;
    private InterstitialAd admobInterstitialAd = null;

    private boolean admobInitialized = false;
    private boolean isLoadingRewarded = false;
    private boolean isLoadingInterstitial = false;
    private boolean admobRewardEarned = false;

    private boolean unityInitialized = false;
    private final Set<String> loadedUnityPlacements = new HashSet<>();
    private final Set<String> loadingUnityPlacements = new HashSet<>();

    private String lastAdMobError = "none";
    private String lastUnityError = "none";

    private String pendingShowPlacementId = null;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final Runnable retryAdMobRewardedRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isFinishing() && admobInitialized && admobRewardedAd == null && !isLoadingRewarded) {
                loadAdMobRewardedAd();
            }
        }
    };

    private final Runnable retryAdMobInterstitialRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isFinishing() && admobInitialized && admobInterstitialAd == null && !isLoadingInterstitial) {
                loadAdMobInterstitialAd();
            }
        }
    };

    private final Runnable retryUnityPlacementsRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isFinishing() && unityInitialized) {
                preloadAllUnityPlacements();
            }
        }
    };

    private final Runnable fallbackTimeoutRunnable = new Runnable() {
        @Override
        public void run() {
            if (pendingShowPlacementId != null) {
                final String pId = pendingShowPlacementId;
                pendingShowPlacementId = null;
                if (admobRewardedAd != null) {
                    presentLoadedRewardedAd(pId);
                    return;
                }
                String readyUnityPlacement = getReadyUnityRewardedPlacement();
                if (readyUnityPlacement != null) {
                    presentUnityRewardedAd(readyUnityPlacement, pId);
                } else {
                    evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + pId + "');");
                }
            }
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } catch (Throwable ignored) {
        }

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.parseColor("#080a0f"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#080a0f"));
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Always call setContentView BEFORE WindowInsetsController for Android 15 / Android 16 compatibility
        setContentView(rootLayout);
        rootLayout.post(this::hideSystemUI);

        try {
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                    .setDomain("appassets.androidplatform.net")
                    .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                    .build();

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    try {
                        return assetLoader.shouldInterceptRequest(request.getUrl());
                    } catch (Throwable t) {
                        return null;
                    }
                }
            });
            webView.setWebChromeClient(new WebChromeClient());

            UnityJSBridge bridge = new UnityJSBridge();
            webView.addJavascriptInterface(bridge, "UnityAds");
            webView.addJavascriptInterface(bridge, "AndroidUnityAds");

            webView.loadUrl("https://appassets.androidplatform.net/index.html");
        } catch (Throwable t) {
            Log.e(TAG, "WebView setup error: " + t.getMessage());
        }

        // 1. Initialize Google AdMob SDK (Primary Ad Network)
        try {
            MobileAds.initialize(this, initializationStatus -> {
                Log.d(TAG, "AdMob SDK Initialized");
                runOnUiThread(() -> {
                    admobInitialized = true;
                    loadAdMobRewardedAd();
                    loadAdMobInterstitialAd();
                    setupAdMobBanner();
                });
            });
        } catch (Throwable t) {
            Log.e(TAG, "AdMob init error: " + t.getMessage());
        }

        // 2. Initialize Official Unity Ads SDK 4.x using Activity context
        initUnityAdsSdk(UNITY_GAME_ID, UNITY_TEST_MODE);
    }

    private void initUnityAdsSdk(final String gameId, final boolean testMode) {
        if (gameId == null || gameId.trim().isEmpty()) return;
        try {
            if (UnityAds.isInitialized()) {
                unityInitialized = true;
                preloadAllUnityPlacements();
                return;
            }
            // Pass Activity context (MainActivity.this) for Unity Ads SDK 4.x compatibility
            UnityAds.initialize(MainActivity.this, gameId.trim(), testMode, new IUnityAdsInitializationListener() {
                @Override
                public void onInitializationComplete() {
                    Log.d(TAG, "Unity Ads SDK Initialized (gameId=" + gameId + ")");
                    unityInitialized = true;
                    runOnUiThread(() -> {
                        evalJs("window.onUnityAdsInitializationComplete && window.onUnityAdsInitializationComplete();");
                        preloadAllUnityPlacements();
                    });
                }

                @Override
                public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
                    lastUnityError = error + ": " + message;
                    Log.w(TAG, "Unity Ads init failed (" + error + "): " + message);
                    runOnUiThread(() -> evalJs("window.onUnityAdsInitializationFailed && window.onUnityAdsInitializationFailed('" + error + "', '" + safeJsStr(message) + "');"));
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "Unity Ads init exception: " + t.getMessage());
        }
    }

    private void preloadAllUnityPlacements() {
        loadUnityPlacement(UNITY_REWARDED_PRIMARY);
        loadUnityPlacement(UNITY_INTERSTITIAL_PRIMARY);
        loadUnityPlacement(UNITY_REWARDED_DEFAULT);
        loadUnityPlacement(UNITY_INTERSTITIAL_DEFAULT);
    }

    private void loadUnityPlacement(final String placementId) {
        if (!unityInitialized || placementId == null || placementId.isEmpty() || isFinishing()) return;
        synchronized (loadedUnityPlacements) {
            if (loadedUnityPlacements.contains(placementId) || loadingUnityPlacements.contains(placementId)) {
                return;
            }
            loadingUnityPlacements.add(placementId);
        }
        try {
            UnityAds.load(placementId, new IUnityAdsLoadListener() {
                @Override
                public void onUnityAdsAdLoaded(String loadedId) {
                    Log.d(TAG, "Unity Ads Loaded: " + loadedId);
                    synchronized (loadedUnityPlacements) {
                        loadingUnityPlacements.remove(loadedId);
                        loadedUnityPlacements.add(loadedId);
                    }
                    runOnUiThread(() -> {
                        evalJs("window.onUnityAdsAdLoaded && window.onUnityAdsAdLoaded('" + loadedId + "');");
                        if (pendingShowPlacementId != null && (loadedId.equals(UNITY_REWARDED_PRIMARY) || loadedId.equals(UNITY_REWARDED_DEFAULT) || loadedId.equals(UNITY_INTERSTITIAL_PRIMARY) || loadedId.equals(pendingShowPlacementId))) {
                            final String reqId = pendingShowPlacementId;
                            pendingShowPlacementId = null;
                            mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                            presentUnityRewardedAd(loadedId, reqId);
                        }
                    });
                }

                @Override
                public void onUnityAdsFailedToLoad(String failedId, UnityAds.UnityAdsLoadError error, String message) {
                    lastUnityError = failedId + " -> " + error + ": " + message;
                    Log.w(TAG, "Unity Ads Failed to load (" + failedId + "): " + error + " - " + message);
                    synchronized (loadedUnityPlacements) {
                        loadingUnityPlacements.remove(failedId);
                        loadedUnityPlacements.remove(failedId);
                    }
                    // Schedule background retry in 15s
                    mainHandler.removeCallbacks(retryUnityPlacementsRunnable);
                    mainHandler.postDelayed(retryUnityPlacementsRunnable, 15000);
                }
            });
        } catch (Throwable t) {
            synchronized (loadedUnityPlacements) {
                loadingUnityPlacements.remove(placementId);
            }
            Log.w(TAG, "Unity Ads load error: " + t.getMessage());
        }
    }

    private boolean isAnyUnityPlacementLoading() {
        synchronized (loadedUnityPlacements) {
            return !loadingUnityPlacements.isEmpty();
        }
    }

    private String getReadyUnityRewardedPlacement() {
        synchronized (loadedUnityPlacements) {
            if (loadedUnityPlacements.contains(UNITY_REWARDED_PRIMARY)) return UNITY_REWARDED_PRIMARY;
            if (loadedUnityPlacements.contains(UNITY_REWARDED_DEFAULT)) return UNITY_REWARDED_DEFAULT;
            if (loadedUnityPlacements.contains(UNITY_INTERSTITIAL_PRIMARY)) return UNITY_INTERSTITIAL_PRIMARY;
            if (loadedUnityPlacements.contains(UNITY_INTERSTITIAL_DEFAULT)) return UNITY_INTERSTITIAL_DEFAULT;
        }
        return null;
    }

    private void presentUnityRewardedAd(final String unityPlacementToPlay, final String jsCallbackUnitId) {
        try {
            synchronized (loadedUnityPlacements) {
                loadedUnityPlacements.remove(unityPlacementToPlay);
            }
            UnityAds.show(MainActivity.this, unityPlacementToPlay, new UnityAdsShowOptions(), new IUnityAdsShowListener() {
                @Override
                public void onUnityAdsShowStart(String placementId) {
                    evalJs("window.onUnityAdsShowStart && window.onUnityAdsShowStart('" + jsCallbackUnitId + "');");
                }

                @Override
                public void onUnityAdsShowClick(String placementId) {
                    evalJs("window.onUnityAdsShowClick && window.onUnityAdsShowClick('" + jsCallbackUnitId + "');");
                }

                @Override
                public void onUnityAdsShowComplete(String placementId, UnityAds.UnityAdsShowCompletionState state) {
                    boolean isInter = unityPlacementToPlay.equals(UNITY_INTERSTITIAL_PRIMARY) || unityPlacementToPlay.equals(UNITY_INTERSTITIAL_DEFAULT);
                    String completion = (state == UnityAds.UnityAdsShowCompletionState.COMPLETED || isInter)
                            ? "COMPLETED"
                            : "SKIPPED";
                    evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + jsCallbackUnitId + "', '" + completion + "');");
                    loadUnityPlacement(unityPlacementToPlay);
                }

                @Override
                public void onUnityAdsShowFailure(String placementId, UnityAds.UnityAdsShowError error, String message) {
                    Log.w(TAG, "Unity Ads Show Failure (" + placementId + "): " + message);
                    loadUnityPlacement(unityPlacementToPlay);
                    evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + jsCallbackUnitId + "');");
                }
            });
        } catch (Throwable t) {
            evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + jsCallbackUnitId + "');");
        }
    }

    private void setupUnityBannerFallback() {
        if (rootLayout == null || isFinishing() || !unityInitialized || unityBannerView != null) return;
        try {
            unityBannerView = new BannerView(this, UNITY_BANNER_PRIMARY, new UnityBannerSize(320, 50));
            FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            bannerParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            rootLayout.addView(unityBannerView, bannerParams);
            unityBannerView.setListener(new BannerView.IListener() {
                @Override
                public void onBannerLoaded(BannerView bannerAdView) {
                    Log.d(TAG, "Unity Banner Loaded (" + UNITY_BANNER_PRIMARY + ")");
                }
                @Override
                public void onBannerShown(BannerView bannerAdView) {}
                @Override
                public void onBannerClick(BannerView bannerAdView) {}
                @Override
                public void onBannerFailedToLoad(BannerView bannerAdView, BannerErrorInfo errorInfo) {
                    Log.w(TAG, "Unity Banner failed (" + UNITY_BANNER_PRIMARY + "): " + errorInfo.errorMessage);
                }
                @Override
                public void onBannerLeftApplication(BannerView bannerView) {}
            });
            unityBannerView.load();
        } catch (Throwable t) {
            Log.w(TAG, "Unity Banner setup warning: " + t.getMessage());
        }
    }

    private void setupAdMobBanner() {
        if (!admobInitialized || rootLayout == null || isFinishing() || PROD_BANNER_UNIT_ID == null || PROD_BANNER_UNIT_ID.isEmpty()) return;
        try {
            if (admobBannerView != null) {
                rootLayout.removeView(admobBannerView);
                admobBannerView.destroy();
                admobBannerView = null;
            }
            admobBannerView = new AdView(this);
            admobBannerView.setAdUnitId(PROD_BANNER_UNIT_ID);
            admobBannerView.setAdSize(AdSize.BANNER);
            FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            bannerParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            rootLayout.addView(admobBannerView, bannerParams);

            admobBannerView.setAdListener(new AdListener() {
                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    Log.w(TAG, "Production Banner failed to load (code=" + loadAdError.getCode() + "): " + loadAdError.getMessage());
                    setupUnityBannerFallback();
                }
            });

            admobBannerView.loadAd(new AdRequest.Builder().build());
        } catch (Throwable e) {
            Log.w(TAG, "AdMob Banner setup warning: " + e.getMessage());
            setupUnityBannerFallback();
        }
    }

    private void loadAdMobRewardedAd() {
        if (!admobInitialized || isLoadingRewarded || admobRewardedAd != null || isFinishing()) return;
        isLoadingRewarded = true;

        try {
            AdRequest adRequest = new AdRequest.Builder().build();
            RewardedAd.load(this, PROD_REWARDED_UNIT_ID, adRequest, new RewardedAdLoadCallback() {
                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    lastAdMobError = "code=" + loadAdError.getCode() + " (" + loadAdError.getMessage() + ")";
                    Log.w(TAG, "Production Rewarded failed (" + PROD_REWARDED_UNIT_ID + "): " + lastAdMobError);
                    isLoadingRewarded = false;
                    admobRewardedAd = null;

                    // Schedule automatic background retry in 12 seconds so next request is ready
                    mainHandler.removeCallbacks(retryAdMobRewardedRunnable);
                    mainHandler.postDelayed(retryAdMobRewardedRunnable, 12000);

                    if (pendingShowPlacementId != null) {
                        final String pId = pendingShowPlacementId;
                        String readyUnity = getReadyUnityRewardedPlacement();
                        if (readyUnity != null) {
                            pendingShowPlacementId = null;
                            mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                            presentUnityRewardedAd(readyUnity, pId);
                        } else if (!isAnyUnityPlacementLoading()) {
                            // Only fall back immediately if Unity Ads is also NOT currently loading
                            pendingShowPlacementId = null;
                            mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                            evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + pId + "');");
                        }
                    }
                }

                @Override
                public void onAdLoaded(@NonNull RewardedAd ad) {
                    Log.d(TAG, "Production AdMob Rewarded Ad Loaded (" + PROD_REWARDED_UNIT_ID + ")");
                    isLoadingRewarded = false;
                    admobRewardedAd = ad;
                    lastAdMobError = "loaded";
                    evalJs("window.onUnityAdsAdLoaded && window.onUnityAdsAdLoaded('BP_Rewarded_Android');");

                    if (pendingShowPlacementId != null) {
                        final String pId = pendingShowPlacementId;
                        pendingShowPlacementId = null;
                        mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                        presentLoadedRewardedAd(pId);
                    }
                }
            });
        } catch (Throwable t) {
            isLoadingRewarded = false;
            mainHandler.removeCallbacks(retryAdMobRewardedRunnable);
            mainHandler.postDelayed(retryAdMobRewardedRunnable, 12000);
        }
    }

    private void loadAdMobInterstitialAd() {
        if (!admobInitialized || isLoadingInterstitial || admobInterstitialAd != null || isFinishing()) return;
        isLoadingInterstitial = true;

        try {
            AdRequest adRequest = new AdRequest.Builder().build();
            InterstitialAd.load(this, PROD_INTERSTITIAL_UNIT_ID, adRequest, new InterstitialAdLoadCallback() {
                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    Log.w(TAG, "Production Interstitial failed (" + PROD_INTERSTITIAL_UNIT_ID + "): " + loadAdError.getMessage());
                    isLoadingInterstitial = false;
                    admobInterstitialAd = null;
                    mainHandler.removeCallbacks(retryAdMobInterstitialRunnable);
                    mainHandler.postDelayed(retryAdMobInterstitialRunnable, 15000);
                }

                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    Log.d(TAG, "Production AdMob Interstitial Ad Loaded (" + PROD_INTERSTITIAL_UNIT_ID + ")");
                    isLoadingInterstitial = false;
                    admobInterstitialAd = ad;
                }
            });
        } catch (Throwable t) {
            isLoadingInterstitial = false;
        }
    }

    private void presentLoadedRewardedAd(final String unit) {
        if (admobRewardedAd == null) {
            String readyUnity = getReadyUnityRewardedPlacement();
            if (readyUnity != null) {
                presentUnityRewardedAd(readyUnity, unit);
            } else {
                evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
            }
            return;
        }
        try {
            RewardedAd adToShow = admobRewardedAd;
            admobRewardedAd = null;
            admobRewardEarned = false;

            adToShow.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdShowedFullScreenContent() {
                    evalJs("window.onUnityAdsShowStart && window.onUnityAdsShowStart('" + unit + "');");
                }

                @Override
                public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                    loadAdMobRewardedAd();
                    String readyUnity = getReadyUnityRewardedPlacement();
                    if (readyUnity != null) {
                        presentUnityRewardedAd(readyUnity, unit);
                    } else {
                        evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
                    }
                }

                @Override
                public void onAdDismissedFullScreenContent() {
                    String state = admobRewardEarned ? "COMPLETED" : "SKIPPED";
                    evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + unit + "', '" + state + "');");
                    loadAdMobRewardedAd();
                }
            });

            adToShow.show(MainActivity.this, rewardItem -> {
                admobRewardEarned = true;
            });
        } catch (Throwable t) {
            evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
        }
    }

    public class UnityJSBridge {
        @JavascriptInterface
        public void initialize(String gameId, boolean testMode) {
            if (gameId != null && !gameId.trim().isEmpty()) {
                UNITY_GAME_ID = gameId.trim();
            }
            UNITY_TEST_MODE = testMode;
            runOnUiThread(() -> {
                if (admobInitialized) {
                    if (admobRewardedAd == null) loadAdMobRewardedAd();
                    if (admobInterstitialAd == null) loadAdMobInterstitialAd();
                }
                initUnityAdsSdk(UNITY_GAME_ID, UNITY_TEST_MODE);
            });
        }

        @JavascriptInterface
        public void setAdMobUnitIds(String bannerId, String interstitialId, String rewardedId) {
            if (bannerId != null && !bannerId.trim().isEmpty()) {
                PROD_BANNER_UNIT_ID = bannerId.trim();
            }
            if (interstitialId != null && !interstitialId.trim().isEmpty()) {
                PROD_INTERSTITIAL_UNIT_ID = interstitialId.trim();
            }
            if (rewardedId != null && !rewardedId.trim().isEmpty()) {
                PROD_REWARDED_UNIT_ID = rewardedId.trim();
            }
            runOnUiThread(() -> {
                if (admobInitialized) {
                    if (admobRewardedAd == null) loadAdMobRewardedAd();
                    if (admobInterstitialAd == null) loadAdMobInterstitialAd();
                }
            });
        }

        @JavascriptInterface
        public void setAdMobRewardedUnitId(String unitId) {
            if (unitId != null && !unitId.trim().isEmpty()) {
                PROD_REWARDED_UNIT_ID = unitId.trim();
                runOnUiThread(() -> {
                    if (admobInitialized) loadAdMobRewardedAd();
                });
            }
        }

        @JavascriptInterface
        public boolean isInitialized() {
            return true;
        }

        @JavascriptInterface
        public boolean isAdReady(String adUnitId) {
            return true;
        }

        @JavascriptInterface
        public String getAdDiagnostics() {
            return "AdMob=" + lastAdMobError + " | Unity=" + lastUnityError;
        }

        @JavascriptInterface
        public void load(String adUnitId) {
            runOnUiThread(() -> {
                if (admobInitialized) {
                    if (admobRewardedAd == null) loadAdMobRewardedAd();
                    if (admobInterstitialAd == null) loadAdMobInterstitialAd();
                }
                if (adUnitId != null && !adUnitId.isEmpty()) {
                    loadUnityPlacement(adUnitId);
                }
                preloadAllUnityPlacements();
            });
        }

        @JavascriptInterface
        public void show(String adUnitId) {
            showRewardedAd(adUnitId);
        }

        @JavascriptInterface
        public void showInterstitialAd() {
            runOnUiThread(() -> {
                if (admobInterstitialAd != null) {
                    try {
                        InterstitialAd inter = admobInterstitialAd;
                        admobInterstitialAd = null;
                        inter.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                loadAdMobInterstitialAd();
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                                loadAdMobInterstitialAd();
                            }
                        });
                        inter.show(MainActivity.this);
                        return;
                    } catch (Throwable ignored) {
                    }
                } else {
                    loadAdMobInterstitialAd();
                }

                // Fallback to Unity Interstitial (BP_Interstitial_Android or Interstitial_Android) if loaded
                String unityInterToPlay = null;
                synchronized (loadedUnityPlacements) {
                    if (loadedUnityPlacements.contains(UNITY_INTERSTITIAL_PRIMARY)) {
                        unityInterToPlay = UNITY_INTERSTITIAL_PRIMARY;
                    } else if (loadedUnityPlacements.contains(UNITY_INTERSTITIAL_DEFAULT)) {
                        unityInterToPlay = UNITY_INTERSTITIAL_DEFAULT;
                    }
                    if (unityInterToPlay != null) {
                        loadedUnityPlacements.remove(unityInterToPlay);
                    }
                }
                if (unityInterToPlay != null) {
                    final String placementIdToReload = unityInterToPlay;
                    UnityAds.show(MainActivity.this, placementIdToReload, new UnityAdsShowOptions(), new IUnityAdsShowListener() {
                        @Override
                        public void onUnityAdsShowStart(String placementId) {}
                        @Override
                        public void onUnityAdsShowClick(String placementId) {}
                        @Override
                        public void onUnityAdsShowComplete(String placementId, UnityAds.UnityAdsShowCompletionState state) {
                            loadUnityPlacement(placementIdToReload);
                        }
                        @Override
                        public void onUnityAdsShowFailure(String placementId, UnityAds.UnityAdsShowError error, String message) {
                            loadUnityPlacement(placementIdToReload);
                        }
                    });
                }
            });
        }

        @JavascriptInterface
        public void showRewardedAd(String adUnitId) {
            final String unit = (adUnitId == null || adUnitId.isEmpty()) ? UNITY_REWARDED_PRIMARY : adUnitId;
            runOnUiThread(() -> {
                // 1. Try Google AdMob Rewarded Ad first
                if (admobRewardedAd != null) {
                    presentLoadedRewardedAd(unit);
                    return;
                }

                // 2. Try Google AdMob Interstitial Ad if loaded
                if (admobInterstitialAd != null) {
                    try {
                        InterstitialAd inter = admobInterstitialAd;
                        admobInterstitialAd = null;
                        inter.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override
                            public void onAdShowedFullScreenContent() {
                                evalJs("window.onUnityAdsShowStart && window.onUnityAdsShowStart('" + unit + "');");
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                                loadAdMobInterstitialAd();
                                String readyUnity = getReadyUnityRewardedPlacement();
                                if (readyUnity != null) {
                                    presentUnityRewardedAd(readyUnity, unit);
                                } else {
                                    evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
                                }
                            }

                            @Override
                            public void onAdDismissedFullScreenContent() {
                                evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + unit + "', 'COMPLETED');");
                                loadAdMobInterstitialAd();
                                loadAdMobRewardedAd();
                            }
                        });
                        inter.show(MainActivity.this);
                        return;
                    } catch (Throwable ignored) {
                    }
                }

                // 3. Try Official Unity Ads SDK (BP_Rewarded_Android or Rewarded_Android)
                String readyUnity = getReadyUnityRewardedPlacement();
                if (readyUnity != null) {
                    presentUnityRewardedAd(readyUnity, unit);
                    return;
                }

                // 4. Request fresh load from both networks and wait up to 3.5s before falling back to in-game video overlay
                pendingShowPlacementId = unit;
                if (admobInitialized && !isLoadingRewarded) {
                    loadAdMobRewardedAd();
                }
                preloadAllUnityPlacements();
                mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                mainHandler.postDelayed(fallbackTimeoutRunnable, 3500);
            });
        }
    }

    private static String safeJsStr(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
    }

    private void evalJs(final String script) {
        if (webView == null || isFinishing()) return;
        runOnUiThread(() -> {
            try {
                webView.evaluateJavascript(script, null);
            } catch (Throwable ignored) {
            }
        });
    }

    private void hideSystemUI() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Window window = getWindow();
                if (window != null && window.getDecorView() != null) {
                    WindowInsetsController controller = window.getInsetsController();
                    if (controller != null) {
                        controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                        controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    }
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
            }
        } catch (Throwable ignored) {
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
        if (admobBannerView != null) {
            admobBannerView.resume();
        }
        hideSystemUI();
    }

    @Override
    protected void onPause() {
        if (admobBannerView != null) {
            admobBannerView.pause();
        }
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }
}
