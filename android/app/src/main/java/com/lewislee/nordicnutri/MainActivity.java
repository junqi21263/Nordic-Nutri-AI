package com.lewislee.nordicnutri;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.content.Intent;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.content.pm.ApplicationInfo;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

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
        public void openLink(String url) {
            android.net.Uri uri = android.net.Uri.parse(url == null ? "" : url);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null) return;
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (android.content.ActivityNotFoundException ignored) { /* No browser installed. */ }
            });
        }
        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName())));
        }
        @JavascriptInterface
        public String testSystemNotification() {
            if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return "unavailable";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && ContextCompat.checkSelfPermission(MainActivity.this, "android.permission.POST_NOTIFICATIONS")
                    != PackageManager.PERMISSION_GRANTED) return "permission_denied";
            NotificationManagerCompat notifications = NotificationManagerCompat.from(MainActivity.this);
            if (!notifications.areNotificationsEnabled()) return "app_blocked";
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
                NotificationChannel channel = manager.getNotificationChannel("system-announcements");
                if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return "channel_blocked";
                if (channel == null) manager.createNotificationChannel(new NotificationChannel(
                        "system-announcements", "系统公告", NotificationManager.IMPORTANCE_HIGH));
            }
            try {
                notifications.notify(7601, new NotificationCompat.Builder(MainActivity.this, "system-announcements")
                        .setSmallIcon(R.drawable.nordic_notification_icon)
                        .setContentTitle("Nordic DEV 本机通知测试")
                        .setContentText("这条通知不经过 FCM，用于检查手机通知权限和通道。")
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setAutoCancel(true)
                        .build());
                return "posted";
            } catch (SecurityException error) {
                return "permission_denied";
            }
        }
        @JavascriptInterface
        public synchronized String consume() {
            if (pendingPushIntent == null) return "";
            String result = pendingPushIntent.toString();
            pendingPushIntent = null;
            return result;
        }
    }

    private synchronized void capturePushIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!"com.lewislee.nordicnutri.PUSH_OPEN".equals(action) && !Intent.ACTION_MAIN.equals(action)) return;
        String deliveryId = intent.getStringExtra("deliveryId");
        String mealType = intent.getStringExtra("mealType");
        if (deliveryId == null || deliveryId.trim().isEmpty() || mealType == null || mealType.trim().isEmpty()) return;
        try {
            pendingPushIntent = new JSONObject()
                    .put("deliveryId", deliveryId.trim())
                    .put("traceId", intent.getStringExtra("traceId"))
                    .put("mealType", mealType.trim())
                    .put("notificationId", intent.getStringExtra("notificationId"))
                    .put("userId", intent.getStringExtra("userId"))
                    .put("kind", intent.getStringExtra("kind"));
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
        getBridge().getWebView().addJavascriptInterface(new PosterBridge(this), "NordicPoster");
        getBridge().getWebView().addJavascriptInterface(new SecureStorageBridge(this), "NordicSecureStorage");
        getBridge().getWebView().addJavascriptInterface(new GoogleAuthBridge(this, getBridge().getWebView()), "NordicGoogleAuth");
        getBridge().getWebView().addJavascriptInterface(new AppUpdateBridge(this, getBridge().getWebView()), "NordicAppUpdate");
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
