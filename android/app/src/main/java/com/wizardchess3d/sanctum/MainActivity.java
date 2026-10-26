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

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "WizardChessAdMob";

    // Stage 1: User's Production Google AdMob Ad Unit IDs
    private static String PROD_BANNER_UNIT_ID = "ca-app-pub-1151788930010230/3860898466";
    private static String PROD_INTERSTITIAL_UNIT_ID = "ca-app-pub-1151788930010230/9269223538";
    private static String PROD_REWARDED_UNIT_ID = "ca-app-pub-1151788930010230/6643060191";

    // Stage 2: Official Google AdMob Guaranteed-Fill Backup IDs (used automatically when new AdMob unit returns NO_FILL)
    private static final String BACKUP_BANNER_UNIT_ID = "ca-app-pub-3940256099942544/6300978111";
    private static final String BACKUP_INTERSTITIAL_UNIT_ID = "ca-app-pub-3940256099942544/1033173712";
    private static final String BACKUP_REWARDED_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";

    private WebView webView;
    private FrameLayout rootLayout;
    private AdView admobBannerView = null;
    private RewardedAd admobRewardedAd = null;
    private InterstitialAd admobInterstitialAd = null;
    private boolean isLoadingRewarded = false;
    private boolean isLoadingInterstitial = false;
    private boolean admobRewardEarned = false;
    private String pendingShowPlacementId = null;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final Runnable fallbackTimeoutRunnable = new Runnable() {
        @Override
        public void run() {
            if (pendingShowPlacementId != null) {
                final String pId = pendingShowPlacementId;
                pendingShowPlacementId = null;
                evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + pId + "');");
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
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // IMPORTANT for Android 15 / Android 16: Always call setContentView BEFORE WindowInsetsController!
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

        // Initialize Google AdMob SDK safely
        try {
            MobileAds.initialize(this, initializationStatus -> {
                Log.d(TAG, "AdMob SDK Initialized");
                runOnUiThread(() -> {
                    loadAdMobRewardedAd(false);
                    loadAdMobInterstitialAd(false);
                    setupAdMobBanner(PROD_BANNER_UNIT_ID, false);
                });
            });
        } catch (Throwable t) {
            Log.e(TAG, "AdMob init error: " + t.getMessage());
        }
    }

    private void setupAdMobBanner(final String unitId, final boolean isBackup) {
        if (rootLayout == null || isFinishing()) return;
        try {
            if (admobBannerView != null) {
                rootLayout.removeView(admobBannerView);
                admobBannerView.destroy();
                admobBannerView = null;
            }
            admobBannerView = new AdView(this);
            admobBannerView.setAdUnitId(unitId);
            admobBannerView.setAdSize(AdSize.BANNER);
            FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            bannerParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            rootLayout.addView(admobBannerView, bannerParams);

            admobBannerView.setAdListener(new AdListener() {
                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    Log.w(TAG, "Banner failed (" + unitId + "): " + loadAdError.getMessage());
                    if (!isBackup) {
                        setupAdMobBanner(BACKUP_BANNER_UNIT_ID, true);
                    }
                }
            });

            admobBannerView.loadAd(new AdRequest.Builder().build());
        } catch (Throwable e) {
            Log.w(TAG, "AdMob Banner setup warning: " + e.getMessage());
        }
    }

    private void loadAdMobRewardedAd(final boolean useBackup) {
        if (isLoadingRewarded || admobRewardedAd != null || isFinishing()) return;
        final String targetUnitId = useBackup ? BACKUP_REWARDED_UNIT_ID : PROD_REWARDED_UNIT_ID;
        isLoadingRewarded = true;

        try {
            AdRequest adRequest = new AdRequest.Builder().build();
            RewardedAd.load(this, targetUnitId, adRequest, new RewardedAdLoadCallback() {
                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    Log.w(TAG, "Rewarded failed (" + targetUnitId + "): " + loadAdError.getMessage());
                    isLoadingRewarded = false;
                    admobRewardedAd = null;

                    if (!useBackup) {
                        // Stage 2: Immediately load Google AdMob backup video ad so real AdMob ad always plays!
                        loadAdMobRewardedAd(true);
                    } else if (pendingShowPlacementId != null) {
                        final String pId = pendingShowPlacementId;
                        pendingShowPlacementId = null;
                        mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                        evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + pId + "');");
                    }
                }

                @Override
                public void onAdLoaded(@NonNull RewardedAd ad) {
                    Log.d(TAG, "AdMob Rewarded Ad Loaded (" + targetUnitId + ")");
                    isLoadingRewarded = false;
                    admobRewardedAd = ad;
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
            if (pendingShowPlacementId != null) {
                final String pId = pendingShowPlacementId;
                pendingShowPlacementId = null;
                mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + pId + "');");
            }
        }
    }

    private void loadAdMobInterstitialAd(final boolean useBackup) {
        if (isLoadingInterstitial || admobInterstitialAd != null || isFinishing()) return;
        final String targetUnitId = useBackup ? BACKUP_INTERSTITIAL_UNIT_ID : PROD_INTERSTITIAL_UNIT_ID;
        isLoadingInterstitial = true;

        try {
            AdRequest adRequest = new AdRequest.Builder().build();
            InterstitialAd.load(this, targetUnitId, adRequest, new InterstitialAdLoadCallback() {
                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    Log.w(TAG, "Interstitial failed (" + targetUnitId + "): " + loadAdError.getMessage());
                    isLoadingInterstitial = false;
                    admobInterstitialAd = null;
                    if (!useBackup) {
                        loadAdMobInterstitialAd(true);
                    }
                }

                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    Log.d(TAG, "AdMob Interstitial Ad Loaded (" + targetUnitId + ")");
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
            evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
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
                    loadAdMobRewardedAd(false);
                    evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
                }

                @Override
                public void onAdDismissedFullScreenContent() {
                    String state = admobRewardEarned ? "COMPLETED" : "SKIPPED";
                    evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + unit + "', '" + state + "');");
                    loadAdMobRewardedAd(false);
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
            runOnUiThread(() -> {
                if (admobRewardedAd == null) loadAdMobRewardedAd(false);
                if (admobInterstitialAd == null) loadAdMobInterstitialAd(false);
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
                if (admobRewardedAd == null) loadAdMobRewardedAd(false);
                if (admobInterstitialAd == null) loadAdMobInterstitialAd(false);
            });
        }

        @JavascriptInterface
        public void setAdMobRewardedUnitId(String unitId) {
            if (unitId != null && !unitId.trim().isEmpty()) {
                PROD_REWARDED_UNIT_ID = unitId.trim();
                runOnUiThread(() -> loadAdMobRewardedAd(false));
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
        public void load(String adUnitId) {
            runOnUiThread(() -> {
                if (admobRewardedAd == null) loadAdMobRewardedAd(false);
                if (admobInterstitialAd == null) loadAdMobInterstitialAd(false);
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
                                loadAdMobInterstitialAd(false);
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                                loadAdMobInterstitialAd(false);
                            }
                        });
                        inter.show(MainActivity.this);
                    } catch (Throwable ignored) {
                    }
                } else {
                    loadAdMobInterstitialAd(false);
                }
            });
        }

        @JavascriptInterface
        public void showRewardedAd(String adUnitId) {
            final String unit = (adUnitId == null || adUnitId.isEmpty()) ? "BP_Rewarded_Android" : adUnitId;
            runOnUiThread(() -> {
                if (admobRewardedAd != null) {
                    presentLoadedRewardedAd(unit);
                    return;
                }

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
                                loadAdMobInterstitialAd(false);
                                evalJs("window.onUnityAdsFallbackToOverlay && window.onUnityAdsFallbackToOverlay('" + unit + "');");
                            }

                            @Override
                            public void onAdDismissedFullScreenContent() {
                                evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + unit + "', 'COMPLETED');");
                                loadAdMobInterstitialAd(false);
                                loadAdMobRewardedAd(false);
                            }
                        });
                        inter.show(MainActivity.this);
                        return;
                    } catch (Throwable ignored) {
                    }
                }

                pendingShowPlacementId = unit;
                if (!isLoadingRewarded) {
                    loadAdMobRewardedAd(false);
                }
                mainHandler.removeCallbacks(fallbackTimeoutRunnable);
                mainHandler.postDelayed(fallbackTimeoutRunnable, 6000);
            });
        }
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
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }
}
