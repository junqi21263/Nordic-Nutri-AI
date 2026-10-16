package com.lewislee.nordicnutri;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Minimal, user-triggered Android updater. APKs must be HTTPS and SHA-256 verified. */
final class AppUpdateBridge {
    private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;
    private final Activity activity;
    private final WebView webView;
    private final AtomicBoolean downloading = new AtomicBoolean(false);

    AppUpdateBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    static boolean isSafeApkUrl(String value) {
        try {
            URI uri = URI.create(value);
            String path = uri.getPath();
            return "https".equalsIgnoreCase(uri.getScheme())
                    && uri.getHost() != null
                    && path != null
                    && path.toLowerCase(Locale.ROOT).endsWith(".apk");
        } catch (Exception ignored) {
            return false;
        }
    }

    static boolean isSafeMarketUrl(String value) {
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme();
            return "market".equalsIgnoreCase(scheme)
                    || ("https".equalsIgnoreCase(scheme) && uri.getHost() != null);
        } catch (Exception ignored) {
            return false;
        }
    }

    static boolean isSha256(String value) {
        return value != null && value.matches("[0-9a-f]{64}");
    }

    @JavascriptInterface
    public String getInfo() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            String installer = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                installer = activity.getPackageManager().getInstallSourceInfo(activity.getPackageName()).getInstallingPackageName();
            } else {
                installer = activity.getPackageManager().getInstallerPackageName(activity.getPackageName());
            }
            return new JSONObject()
                    .put("versionCode", code)
                    .put("versionName", info.versionName == null ? "" : info.versionName)
                    .put("installerPackage", installer == null ? JSONObject.NULL : installer)
                    .toString();
        } catch (Exception error) {
            return "{\"versionCode\":0,\"versionName\":\"\",\"installerPackage\":null}";
        }
    }

    @JavascriptInterface
    public boolean openMarket(String marketUrl) {
        if (!isSafeMarketUrl(marketUrl)) return false;
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(marketUrl)));
            } catch (Exception error) {
                emit("market_unavailable", 0, "");
            }
        });
        return true;
    }

    @JavascriptInterface
    public boolean downloadAndInstall(String apkUrl, String expectedSha256, long expectedVersionCode, String expectedVersionName) {
        if (!isSafeApkUrl(apkUrl) || !isSha256(expectedSha256) || expectedVersionCode < 1
                || expectedVersionName == null || expectedVersionName.trim().isEmpty()
                || !downloading.compareAndSet(false, true)) return false;
        new Thread(() -> {
            File target = null;
            try {
                emit("downloading", 0, "");
                File directory = new File(activity.getCacheDir(), "app-updates");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("update directory unavailable");
                target = new File(directory, "update-" + expectedVersionCode + "-" + expectedSha256.substring(0, 12) + ".apk");
                download(apkUrl, target);
                if (!expectedSha256.equals(sha256(target))) throw new SecurityException("sha256 mismatch");
                verifyApkVersion(target, expectedVersionCode, expectedVersionName);
                emit("verified", 100, "");
                install(target);
            } catch (Exception error) {
                if (target != null) target.delete();
                emit("failed", 0, "UPDATE_DOWNLOAD_FAILED");
            } finally {
                downloading.set(false);
            }
        }, "nordic-app-update").start();
        return true;
    }

    private void verifyApkVersion(File apk, long expectedVersionCode, String expectedVersionName) {
        PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (info == null) throw new SecurityException("invalid apk");
        long actualVersionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
        String actualVersionName = info.versionName == null ? "" : info.versionName;
        if (!activity.getPackageName().equals(info.packageName)
                || actualVersionCode != expectedVersionCode
                || !expectedVersionName.equals(actualVersionName)) {
            throw new SecurityException("apk metadata does not match release metadata");
        }
    }

    private void download(String source, File target) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setUseCaches(false);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
        connection.setRequestProperty("Cache-Control", "no-cache, no-store");
        connection.setRequestProperty("Pragma", "no-cache");
        connection.connect();
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) throw new IllegalStateException("download status");
        long total = connection.getContentLengthLong();
        if (total > MAX_APK_BYTES) throw new IllegalStateException("apk too large");
        long received = 0;
        int lastProgress = 0;
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                received += count;
                if (received > MAX_APK_BYTES) throw new IllegalStateException("apk too large");
                output.write(buffer, 0, count);
                if (total > 0) {
                    int progress = (int) Math.min(99, received * 100 / total);
                    if (progress >= lastProgress + 10) {
                        lastProgress = progress;
                        emit("downloading", progress, "");
                    }
                }
            }
        } finally {
            connection.disconnect();
        }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder value = new StringBuilder();
        for (byte item : digest.digest()) value.append(String.format(Locale.ROOT, "%02x", item));
        return value.toString();
    }

    private void install(File apk) {
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
                    emit("permission_required", 100, "");
                    Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(settings);
                    return;
                }
                Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                emit("installing", 100, "");
                activity.startActivity(intent);
            } catch (Exception error) {
                emit("failed", 0, "UPDATE_INSTALL_FAILED");
            }
        });
    }

    private void emit(String phase, int progress, String code) {
        try {
            JSONObject detail = new JSONObject().put("phase", phase).put("progress", progress);
            if (!code.isEmpty()) detail.put("code", code);
            String script = "window.dispatchEvent(new CustomEvent('nordicappupdate',{detail:" + detail + "}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
        } catch (Exception ignored) {
            // Update events are best effort; verification and installation remain native.
        }
    }
}
