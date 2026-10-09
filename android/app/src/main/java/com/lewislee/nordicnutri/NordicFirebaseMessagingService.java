package com.lewislee.nordicnutri;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;

import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class NordicFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "meal-reminders";
    private static final String RECEIPT_ENDPOINT = "/push-delivery/native-ack";
    private static final ExecutorService RECEIPT_EXECUTOR = Executors.newCachedThreadPool();
    private static volatile String currentToken = "";

    @Override
    public void onNewToken(String token) {
        currentToken = token == null ? "" : token.trim();
        if (token != null && !token.trim().isEmpty()) {
            PushNotificationsPlugin.onNewToken(token);
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Log.i("NordicPush", "FCM message received");
        Map<String, String> data = message.getData();
        String deliveryId = value(data, "deliveryId");
        String traceId = value(data, "traceId");
        String mealType = value(data, "mealType");
        String title = value(data, "title");
        String body = value(data, "body");
        if (title.isEmpty()) title = mealLabel(mealType) + "还没记录吗？";
        if (body.isEmpty()) body = "拍一下就好 📷";

        ensureChannel();
        boolean permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS")
                == PackageManager.PERMISSION_GRANTED;
        if (permissionGranted) {
            try {
                Intent intent = new Intent(this, MainActivity.class)
                        .setAction("com.lewislee.nordicnutri.PUSH_OPEN")
                        .putExtra("deliveryId", deliveryId)
                        .putExtra("traceId", traceId)
                        .putExtra("mealType", mealType)
                        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pendingIntent = PendingIntent.getActivity(
                        this,
                        stableNotificationId(deliveryId),
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(R.drawable.nordic_notification_icon)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setCategory(NotificationCompat.CATEGORY_REMINDER)
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent);
                NotificationManagerCompat.from(this).notify(stableNotificationId(deliveryId), notification.build());
                acknowledgeWithCurrentToken(deliveryId, "received");
                acknowledgeWithCurrentToken(deliveryId, "displayed");
                PushNotificationsPlugin.sendRemoteMessage(message);
                Log.i("NordicPush", "notification posted");
                return;
            } catch (SecurityException ignored) {
                // Permission can change between the check and notify; report receipt only.
            }
        }
        PushNotificationsPlugin.sendRemoteMessage(message);
        acknowledgeWithCurrentToken(deliveryId, "received");
    }

    private void acknowledgeWithCurrentToken(String deliveryId, String event) {
        if (!currentToken.isEmpty()) {
            acknowledge(deliveryId, event, currentToken);
            return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                currentToken = task.getResult().trim();
                acknowledge(deliveryId, event, currentToken);
            }
        });
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.push_notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(getString(R.string.push_notification_channel_description));
        manager.createNotificationChannel(channel);
    }

    private void acknowledge(String deliveryId, String event, String token) {
        if (deliveryId.isEmpty() || event.isEmpty() || token == null || token.isEmpty()) return;
        RECEIPT_EXECUTOR.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(getString(R.string.push_receipt_api_base_url) + RECEIPT_ENDPOINT);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                JSONObject payload = new JSONObject()
                        .put("deliveryId", deliveryId)
                        .put("event", event)
                        .put("token", token);
                try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(
                        connection.getOutputStream(), StandardCharsets.UTF_8))) {
                    writer.write(payload.toString());
                }
                connection.getResponseCode();
            } catch (Exception ignored) {
                // Receipt delivery is best effort and must never crash the FCM service.
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private static String value(Map<String, String> data, String key) {
        String value = data.get(key);
        return value == null ? "" : value.trim();
    }

    private static int stableNotificationId(String deliveryId) {
        return deliveryId.isEmpty() ? 1001 : (deliveryId.hashCode() & 0x7fffffff);
    }

    private static String mealLabel(String mealType) {
        if ("breakfast".equals(mealType)) return "早餐";
        if ("lunch".equals(mealType)) return "午餐";
        if ("dinner".equals(mealType)) return "晚餐";
        return "这一餐";
    }
}
