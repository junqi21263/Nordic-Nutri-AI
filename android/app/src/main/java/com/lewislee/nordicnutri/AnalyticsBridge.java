package com.lewislee.nordicnutri;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Reads only OS exit categories on explicit diagnostic consent; never reads trace streams. */
public final class AnalyticsBridge {
    private final android.content.Context context;
    private final WeakReference<WebView> webView;
    private final AtomicBoolean inFlight = new AtomicBoolean(false);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    public AnalyticsBridge(android.content.Context context, WebView webView) {
        this.context = context.getApplicationContext();
        this.webView = new WeakReference<>(webView);
    }

    @JavascriptInterface
    public void getExitDiagnostics(String requestId, double sinceMillis) {
        if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{1,80}")
                || !Double.isFinite(sinceMillis) || sinceMillis <= 0) return;
        final long cutoff = Math.max((long) sinceMillis, System.currentTimeMillis() - 72L * 60 * 60 * 1000);
        if (!inFlight.compareAndSet(false, true)) return;
        worker.execute(() -> {
          try {
            JSONObject result = new JSONObject();
            JSONArray events = new JSONArray();
            try {
                result.put("requestId", requestId).put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
                result.put("coverage", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? "android_exit_history" : "unsupported");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    ActivityManager manager = (ActivityManager) context.getSystemService(android.content.Context.ACTIVITY_SERVICE);
                    if (manager == null) throw new IllegalStateException("diagnostics_unavailable");
                    for (ApplicationExitInfo exit : manager.getHistoricalProcessExitReasons(context.getPackageName(), 0, 20)) {
                        if (exit.getTimestamp() <= cutoff) continue;
                        String reason;
                        switch (exit.getReason()) {
                            case ApplicationExitInfo.REASON_CRASH: reason = "crash"; break;
                            case ApplicationExitInfo.REASON_CRASH_NATIVE: reason = "native_crash"; break;
                            case ApplicationExitInfo.REASON_ANR: reason = "anr"; break;
                            default: continue;
                        }
                        events.put(new JSONObject().put("timestamp", exit.getTimestamp()).put("reason", reason)
                                .put("stage", "previous_process").put("error_type", reason));
                    }
                }
            } catch (Exception error) {
                try { result.put("coverage", "unavailable"); } catch (Exception ignored) { return; }
            }
            try { result.put("events", events); } catch (Exception ignored) { return; }
            WebView view = webView.get();
            if (view != null) view.post(() -> view.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nordicanalyticsdiagnostics',{detail:" + result.toString() + "}))", null));
          } finally { inFlight.set(false); }
        });
    }
}
