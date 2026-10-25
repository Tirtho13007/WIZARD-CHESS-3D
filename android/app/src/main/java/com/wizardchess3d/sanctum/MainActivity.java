package com.wizardchess3d.sanctum;

import android.annotation.SuppressLint;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
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

import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsShowOptions;

public class MainActivity extends AppCompatActivity implements IUnityAdsInitializationListener {

    private static final String TAG = "WizardChessUnityAds";
    private static final String UNITY_GAME_ID = "800410658";
    private static final boolean TEST_MODE = false;
    private static final String REWARDED_AD_UNIT_ID = "BP_Rewarded_Android";

    private WebView webView;
    private boolean adLoaded = false;

    private final IUnityAdsLoadListener loadListener = new IUnityAdsLoadListener() {
        @Override
        public void onUnityAdsAdLoaded(String placementId) {
            Log.d(TAG, "Unity Ad Loaded: " + placementId);
            adLoaded = true;
            evalJs("window.onUnityAdsAdLoaded && window.onUnityAdsAdLoaded('" + placementId + "');");
        }

        @Override
        public void onUnityAdsFailedToLoad(String placementId, UnityAds.UnityAdsLoadError error, String message) {
            Log.e(TAG, "Unity Ad Failed to Load [" + placementId + "]: " + error + " - " + message);
            adLoaded = false;
            evalJs("window.onUnityAdsFailedToLoad && window.onUnityAdsFailedToLoad('" + placementId + "', '" + error.name() + "', '');");
        }
    };

    private final IUnityAdsShowListener showListener = new IUnityAdsShowListener() {
        @Override
        public void onUnityAdsShowFailure(String placementId, UnityAds.UnityAdsShowError error, String message) {
            Log.e(TAG, "Unity Ad Show Failure [" + placementId + "]: " + error + " - " + message);
            evalJs("window.onUnityAdsShowFailure && window.onUnityAdsShowFailure('" + placementId + "', '" + error.name() + "', '');");
            UnityAds.load(REWARDED_AD_UNIT_ID, loadListener);
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
            String completionState = state == UnityAds.UnityAdsShowCompletionState.COMPLETED ? "COMPLETED" : "SKIPPED";
            evalJs("window.onUnityAdsShowComplete && window.onUnityAdsShowComplete('" + placementId + "', '" + completionState + "');");
            // Preload next Rewarded Ad immediately
            UnityAds.load(REWARDED_AD_UNIT_ID, loadListener);
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

        // Initialize Official Unity Ads SDK 4.x (Game ID: 800410658, testMode: false)
        UnityAds.initialize(getApplicationContext(), UNITY_GAME_ID, TEST_MODE, this);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#080a0f"));
        setContentView(webView);

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

        // Expose native Unity Ads SDK bridge to JavaScript (window.UnityAds)
        UnityJSBridge bridge = new UnityJSBridge();
        webView.addJavascriptInterface(bridge, "UnityAds");
        webView.addJavascriptInterface(bridge, "AndroidUnityAds");

        // Load bundled 3D game directly from APK assets (no external browser)
        webView.loadUrl("https://appassets.androidplatform.net/index.html");
    }

    @Override
    public void onInitializationComplete() {
        Log.d(TAG, "Unity Ads SDK Initialized (Game ID: " + UNITY_GAME_ID + ")");
        UnityAds.load(REWARDED_AD_UNIT_ID, loadListener);
        evalJs("window.onUnityAdsInitializationComplete && window.onUnityAdsInitializationComplete();");
    }

    @Override
    public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
        Log.e(TAG, "Unity Ads Initialization Failed: " + error + " - " + message);
    }

    public class UnityJSBridge {
        @JavascriptInterface
        public void initialize(String gameId, boolean testMode) {
            runOnUiThread(() -> {
                if (!UnityAds.isInitialized()) {
                    UnityAds.initialize(getApplicationContext(), UNITY_GAME_ID, TEST_MODE, MainActivity.this);
                } else {
                    UnityAds.load(REWARDED_AD_UNIT_ID, loadListener);
                }
            });
        }

        @JavascriptInterface
        public boolean isInitialized() {
            return UnityAds.isInitialized();
        }

        @JavascriptInterface
        public void load(String adUnitId) {
            final String unit = (adUnitId == null || adUnitId.isEmpty()) ? REWARDED_AD_UNIT_ID : adUnitId;
            runOnUiThread(() -> UnityAds.load(unit, loadListener));
        }

        @JavascriptInterface
        public void show(String adUnitId) {
            showRewardedAd(adUnitId);
        }

        @JavascriptInterface
        public void showRewardedAd(String adUnitId) {
            final String unit = (adUnitId == null || adUnitId.isEmpty()) ? REWARDED_AD_UNIT_ID : adUnitId;
            runOnUiThread(() -> {
                if (UnityAds.isInitialized()) {
                    UnityAds.show(MainActivity.this, unit, new UnityAdsShowOptions(), showListener);
                } else {
                    UnityAds.initialize(getApplicationContext(), UNITY_GAME_ID, TEST_MODE, MainActivity.this);
                    evalJs("window.onUnityAdsShowFailure && window.onUnityAdsShowFailure('" + unit + "', 'NOT_INITIALIZED', '');");
                }
            });
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
