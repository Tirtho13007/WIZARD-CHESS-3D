package com.wizardchess3d.sanctum;

import android.annotation.SuppressLint;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
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

public class MainActivity extends AppCompatActivity implements IUnityAdsInitializationListener {

    private static final String TAG = "WizardChessAds";

    // Google AdMob Production Ad Unit IDs provided by User
    private static String ADMOB_BANNER_UNIT_ID = "ca-app-pub-1151788930010230/3860898466";
    private static String ADMOB_INTERSTITIAL_UNIT_ID = "ca-app-pub-1151788930010230/9269223538";
    private static String ADMOB_REWARDED_UNIT_ID = "ca-app-pub-1151788930010230/6643060191";

    // Unity Ads Production Backup Configuration
    private static final String UNITY_GAME_ID = "800410658";
    private static final boolean UNITY_TEST_MODE = false;
    private static final String UNITY_REWARDED_UNIT_ID = "BP_Rewarded_Android";

    private WebView webView;
    private AdView admobBannerView = null;
    private RewardedAd admobRewardedAd = null;
    private InterstitialAd admobInterstitialAd = null;
    private boolean admobRewardEarned = false;
    private boolean unityAdLoaded = false;

    private final IUnityAdsLoadListener unityLoadListener = new IUnityAdsLoadListener() {
        @Override
        public void onUnityAdsAdLoaded(String placementId) {
            Log.d(TAG, "Unity Ad Loaded: " + placementId);
            unityAdLoaded = true;
            evalJs("window.onUnityAdsAdLoaded && window.onUnityAdsAdLoaded('" + placementId + "');");
        }

        @Override
        public void onUnityAdsFailedToLoad(String placementId, UnityAds.UnityAdsLoadError error, String message) {
            Log.w(TAG, "Unity Ad Failed to Load [" + placementId + "]: " + error + " - " + message);
            unityAdLoaded = false;
            evalJs("window.onUnityAdsFailedToLoad && window.onUnityAdsFailedToLoad('" + placementId + "', '" + error.name() + "', '');");
        }
    };

    private final IUnityAdsShowListener unityShowListener = new IUnityAdsShowListener() {
        @Override
        public void onUnityAdsShowFailure(String placementId, UnityAds.UnityAdsShowError error, String message) {
            Log.w(TAG, "Unity Ad Show Failure [" + placementId + "]: " + error + " - " + message);
            unityAdLoaded = false;
            UnityAds.load(UNITY_REWARDED_UNIT_ID, unityLoadListener);
            // Fall back to in-game video ad overlay so Hint / Undo always works
            evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + placementId + "');");
        }

        @Override
        public void onUnityAdsShowStart(String placementId) {
            Log.d(TAG, "Unity Ad Show Start: " + placementId);
            evalJs("window.onUnityAdsShowStart && window.onUnityAdsShowStart('" + placementId + "');");
        }

        @Override
        public void onUnityAdsShowClick(String placementId) {
            evalJs("window.onUnityAdsShowClick && window.onUnityAdsShowClick('" + placementId + "');");
        }

        @Override
        public void onUnityAdsShowComplete(String placementId, UnityAds.UnityAdsShowCompletionState state) {
            Log.d(TAG, "Unity Ad Show Complete: " + placementId + " -> " + state.name());
            unityAdLoaded = false;
            String completionState = state == UnityAds.UnityAdsShowCompletionState.COMPLETED ? "COMPLETED" : "SKIPPED";
            evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + placementId + "', '" + completionState + "');");
            UnityAds.load(UNITY_REWARDED_UNIT_ID, unityLoadListener);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Lock orientation to Landscape & keep screen awake
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUI();

        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(Color.parseColor("#080a0f"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#080a0f"));
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(rootLayout);

        // 1. Initialize Google AdMob SDK & preload Rewarded + Interstitial + Banner Ads
        MobileAds.initialize(this, initializationStatus -> {
            Log.d(TAG, "AdMob SDK Initialized");
            loadAdMobRewardedAd();
            loadAdMobInterstitialAd();
            setupAdMobBanner(rootLayout);
        });

        // 2. Initialize Unity Ads SDK 4.x Backup (Game ID: 800410658, testMode: false)
        UnityAds.initialize(getApplicationContext(), UNITY_GAME_ID, UNITY_TEST_MODE, this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Serve bundled game files from assets/ locally with zero browser URL bar
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        // Expose native AdMob + Unity Ads SDK bridge to JavaScript
        UnityJSBridge bridge = new UnityJSBridge();
        webView.addJavascriptInterface(bridge, "UnityAds");
        webView.addJavascriptInterface(bridge, "AndroidUnityAds");

        // Load bundled 3D game directly from APK assets (no external browser)
        webView.loadUrl("https://appassets.androidplatform.net/index.html");
    }

    private void setupAdMobBanner(FrameLayout rootLayout) {
        if (ADMOB_BANNER_UNIT_ID == null || ADMOB_BANNER_UNIT_ID.isEmpty()) return;
        try {
            admobBannerView = new AdView(this);
            admobBannerView.setAdUnitId(ADMOB_BANNER_UNIT_ID);
            admobBannerView.setAdSize(AdSize.BANNER);
            FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            bannerParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            rootLayout.addView(admobBannerView, bannerParams);
            admobBannerView.loadAd(new AdRequest.Builder().build());
        } catch (Exception e) {
            Log.w(TAG, "AdMob Banner setup warning: " + e.getMessage());
        }
    }

    private void loadAdMobRewardedAd() {
        if (ADMOB_REWARDED_UNIT_ID == null || ADMOB_REWARDED_UNIT_ID.isEmpty()) return;
        AdRequest adRequest = new AdRequest.Builder().build();
        RewardedAd.load(this, ADMOB_REWARDED_UNIT_ID, adRequest, new RewardedAdLoadCallback() {
            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                Log.w(TAG, "AdMob Rewarded Ad failed to load: " + loadAdError.getMessage());
                admobRewardedAd = null;
            }

            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                Log.d(TAG, "AdMob Rewarded Ad Loaded: " + ADMOB_REWARDED_UNIT_ID);
                admobRewardedAd = ad;
                evalJs("window.onUnityAdsAdLoaded && window.onUnityAdsAdLoaded('" + UNITY_REWARDED_UNIT_ID + "');");
            }
        });
    }

    private void loadAdMobInterstitialAd() {
        if (ADMOB_INTERSTITIAL_UNIT_ID == null || ADMOB_INTERSTITIAL_UNIT_ID.isEmpty()) return;
        AdRequest adRequest = new AdRequest.Builder().build();
        InterstitialAd.load(this, ADMOB_INTERSTITIAL_UNIT_ID, adRequest, new InterstitialAdLoadCallback() {
            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                Log.w(TAG, "AdMob Interstitial Ad failed to load: " + loadAdError.getMessage());
                admobInterstitialAd = null;
            }

            @Override
            public void onAdLoaded(@NonNull InterstitialAd ad) {
                Log.d(TAG, "AdMob Interstitial Ad Loaded: " + ADMOB_INTERSTITIAL_UNIT_ID);
                admobInterstitialAd = ad;
            }
        });
    }

    @Override
    public void onInitializationComplete() {
        Log.d(TAG, "Unity Ads SDK Initialized (Game ID: " + UNITY_GAME_ID + ")");
        UnityAds.load(UNITY_REWARDED_UNIT_ID, unityLoadListener);
        evalJs("window.onUnityAdsInitializationComplete && window.onUnityAdsInitializationComplete();");
    }

    @Override
    public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
        Log.w(TAG, "Unity Ads Initialization Failed: " + error + " - " + message);
    }

    public class UnityJSBridge {
        @JavascriptInterface
        public void initialize(String gameId, boolean testMode) {
            runOnUiThread(() -> {
                if (admobRewardedAd == null) {
                    loadAdMobRewardedAd();
                }
                if (admobInterstitialAd == null) {
                    loadAdMobInterstitialAd();
                }
                if (!UnityAds.isInitialized()) {
                    UnityAds.initialize(getApplicationContext(), UNITY_GAME_ID, UNITY_TEST_MODE, MainActivity.this);
                } else if (!unityAdLoaded) {
                    UnityAds.load(UNITY_REWARDED_UNIT_ID, unityLoadListener);
                }
            });
        }

        @JavascriptInterface
        public void setAdMobUnitIds(String bannerId, String interstitialId, String rewardedId) {
            if (bannerId != null && !bannerId.trim().isEmpty()) {
                ADMOB_BANNER_UNIT_ID = bannerId.trim();
            }
            if (interstitialId != null && !interstitialId.trim().isEmpty()) {
                ADMOB_INTERSTITIAL_UNIT_ID = interstitialId.trim();
            }
            if (rewardedId != null && !rewardedId.trim().isEmpty()) {
                ADMOB_REWARDED_UNIT_ID = rewardedId.trim();
            }
            runOnUiThread(() -> {
                if (admobRewardedAd == null) loadAdMobRewardedAd();
                if (admobInterstitialAd == null) loadAdMobInterstitialAd();
            });
        }

        @JavascriptInterface
        public void setAdMobRewardedUnitId(String unitId) {
            if (unitId != null && !unitId.trim().isEmpty()) {
                ADMOB_REWARDED_UNIT_ID = unitId.trim();
                runOnUiThread(MainActivity.this::loadAdMobRewardedAd);
            }
        }

        @JavascriptInterface
        public boolean isInitialized() {
            return admobRewardedAd != null || admobInterstitialAd != null || UnityAds.isInitialized();
        }

        @JavascriptInterface
        public boolean isAdReady(String adUnitId) {
            return admobRewardedAd != null || admobInterstitialAd != null || (unityAdLoaded && UnityAds.isInitialized());
        }

        @JavascriptInterface
        public void load(String adUnitId) {
            final String unit = (adUnitId == null || adUnitId.isEmpty()) ? UNITY_REWARDED_UNIT_ID : adUnitId;
            runOnUiThread(() -> {
                if (admobRewardedAd == null) {
                    loadAdMobRewardedAd();
                }
                if (admobInterstitialAd == null) {
                    loadAdMobInterstitialAd();
                }
                if (UnityAds.isInitialized() && !unityAdLoaded) {
                    UnityAds.load(unit, unityLoadListener);
                }
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
                    admobInterstitialAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdDismissedFullScreenContent() {
                            admobInterstitialAd = null;
                            loadAdMobInterstitialAd();
                        }

                        @Override
                        public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                            admobInterstitialAd = null;
                            loadAdMobInterstitialAd();
                        }
                    });
                    admobInterstitialAd.show(MainActivity.this);
                } else {
                    loadAdMobInterstitialAd();
                }
            });
        }

        @JavascriptInterface
        public void showRewardedAd(String adUnitId) {
            final String unit = (adUnitId == null || adUnitId.isEmpty()) ? UNITY_REWARDED_UNIT_ID : adUnitId;
            runOnUiThread(() -> {
                // 1. Primary: Show Google AdMob Rewarded Ad (ca-app-pub-1151788930010230/6643060191)
                if (admobRewardedAd != null) {
                    admobRewardEarned = false;
                    admobRewardedAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdShowedFullScreenContent() {
                            evalJs("window.onUnityAdsShowStart && window.onUnityAdsShowStart('" + unit + "');");
                        }

                        @Override
                        public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                            admobRewardedAd = null;
                            loadAdMobRewardedAd();
                            showSecondaryOrFallbackAd(unit);
                        }

                        @Override
                        public void onAdDismissedFullScreenContent() {
                            admobRewardedAd = null;
                            String state = admobRewardEarned ? "COMPLETED" : "SKIPPED";
                            evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + unit + "', '" + state + "');");
                            loadAdMobRewardedAd();
                        }
                    });

                    admobRewardedAd.show(MainActivity.this, rewardItem -> {
                        admobRewardEarned = true;
                    });
                    return;
                }

                showSecondaryOrFallbackAd(unit);
            });
        }

        private void showSecondaryOrFallbackAd(String unit) {
            // 2. Secondary: Show Google AdMob Interstitial Ad (ca-app-pub-1151788930010230/9269223538) if loaded
            if (admobInterstitialAd != null) {
                admobInterstitialAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override
                    public void onAdShowedFullScreenContent() {
                        evalJs("window.onUnityAdsShowStart && window.onUnityAdsShowStart('" + unit + "');");
                    }

                    @Override
                    public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                        admobInterstitialAd = null;
                        loadAdMobInterstitialAd();
                        evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
                    }

                    @Override
                    public void onAdDismissedFullScreenContent() {
                        admobInterstitialAd = null;
                        evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + unit + "', 'COMPLETED');");
                        loadAdMobInterstitialAd();
                    }
                });
                admobInterstitialAd.show(MainActivity.this);
                return;
            }

            // 3. Tertiary: Show Unity Ads Rewarded Ad if loaded
            if (unityAdLoaded && UnityAds.isInitialized()) {
                unityAdLoaded = false;
                UnityAds.show(MainActivity.this, unit, new UnityAdsShowOptions(), unityShowListener);
                return;
            }

            // 4. Reload in background and immediately open in-game Rewarded Video Overlay so Hint/Undo always works!
            loadAdMobRewardedAd();
            loadAdMobInterstitialAd();
            if (UnityAds.isInitialized()) {
                UnityAds.load(unit, unityLoadListener);
            }
            evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
        }
    }

    private void evalJs(final String script) {
        if (webView == null) return;
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private void hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
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
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }
}
