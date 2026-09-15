package com.lewislee.nordicnutri;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.content.Intent;

import org.json.JSONObject;

import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean welcomeVisible = false;
    private boolean authLandingVisible = false;
    private JSONObject pendingPushIntent;

    public class WelcomeInsetsBridge {
        @JavascriptInterface
        public void setAuthLandingVisible(boolean visible) {
            runOnUiThread(() -> {
                authLandingVisible = visible;
                ViewCompat.requestApplyInsets(findViewById(android.R.id.content));
            });
        }

        @JavascriptInterface
        public void setVisible(boolean visible) {
            runOnUiThread(() -> {
                welcomeVisible = visible;
                ViewCompat.requestApplyInsets(findViewById(android.R.id.content));
            });
        }
    }

    public class PushIntentBridge {
        @JavascriptInterface
        public synchronized String consume() {
            if (pendingPushIntent == null) return "";
            String result = pendingPushIntent.toString();
            pendingPushIntent = null;
            return result;
        }
    }

    private synchronized void capturePushIntent(Intent intent) {
        if (intent == null || !"com.lewislee.nordicnutri.PUSH_OPEN".equals(intent.getAction())) return;
        String deliveryId = intent.getStringExtra("deliveryId");
        String mealType = intent.getStringExtra("mealType");
        if (deliveryId == null || deliveryId.trim().isEmpty() || mealType == null || mealType.trim().isEmpty()) return;
        try {
            pendingPushIntent = new JSONObject()
                    .put("deliveryId", deliveryId.trim())
                    .put("traceId", intent.getStringExtra("traceId"))
                    .put("mealType", mealType.trim());
        } catch (Exception ignored) {
            pendingPushIntent = null;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        capturePushIntent(getIntent());
        configureSystemBars();
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.rgb(251, 250, 247));
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets safeInsets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safeInsets.left, authLandingVisible ? 0 : safeInsets.top, safeInsets.right,
                    welcomeVisible ? 0 : safeInsets.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
        getWindow().getDecorView().post(this::configureSystemBars);
        getBridge().getWebView().setBackgroundColor(Color.rgb(91, 58, 41));
        getBridge().getWebView().addJavascriptInterface(new WelcomeInsetsBridge(), "NordicWelcomeInsets");
        getBridge().getWebView().addJavascriptInterface(new PushIntentBridge(), "NordicPushIntent");
        getBridge().getWebView().addJavascriptInterface(new SecureStorageBridge(this), "NordicSecureStorage");
        getBridge().getWebView().addJavascriptInterface(new GoogleAuthBridge(this, getBridge().getWebView()), "NordicGoogleAuth");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        capturePushIntent(intent);
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('nordicpushintent'))",
                null
        ));
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) configureSystemBars();
    }

    private void configureSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController insetsController = getWindow().getInsetsController();
            if (insetsController != null) {
                int lightSystemBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                insetsController.setSystemBarsAppearance(
                        lightSystemBars,
                        lightSystemBars
                );
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int systemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
            systemUiVisibility |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            systemUiVisibility |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(systemUiVisibility);
        }
    }

    @Override
    public void onBackPressed() {
        getBridge().getWebView().evaluateJavascript(
                "(function(){return window.__nordicAndroidBack ? window.__nordicAndroidBack() : false;})()",
                result -> {
                    if (!"true".equals(result)) super.onBackPressed();
                }
        );
    }
}
