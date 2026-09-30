package com.lewislee.nordicnutri;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** User-triggered PNG save only; no file paths or arbitrary URI access exposed to JS. */
public final class PosterBridge {
    private final Context context;
    public PosterBridge(Context context) { this.context = context; }

    @JavascriptInterface
    public String savePng(String data) {
        if (Build.VERSION.SDK_INT < 29) return "{\"ok\":false}";
        if (data == null || !data.startsWith("data:image/png;base64,") || data.length() > 8000000) return "{\"ok\":false}";
        Uri uri = null;
        try {
            byte[] png = Base64.decode(data.substring(22), Base64.DEFAULT);
            byte[] signature = {(byte)137, 80, 78, 71, 13, 10, 26, 10};
            if (png.length < 8) return "{\"ok\":false}";
            for (int i = 0; i < 8; i++) if (png[i] != signature[i]) return "{\"ok\":false}";
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, "Nordic-Weekly-" + System.currentTimeMillis() + ".png");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Nordic");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            uri = context.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("No image destination");
            try (OutputStream output = context.getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("No image stream");
                output.write(png);
            }
            values.clear(); values.put(MediaStore.Images.Media.IS_PENDING, 0);
            context.getContentResolver().update(uri, values, null, null);
            return "{\"ok\":true}";
        } catch (Exception error) {
            if (uri != null) context.getContentResolver().delete(uri, null, null);
            return "{\"ok\":false}";
        }
    }

    @JavascriptInterface
    public String sharePng(String data) {
        byte[] png = decodePng(data);
        if (png == null) return "{\"ok\":false}";
        try {
            File directory = new File(context.getCacheDir(), "shared-posters");
            if (!directory.exists() && !directory.mkdirs()) return "{\"ok\":false}";
            File image = new File(directory, "nordic-weekly-" + System.currentTimeMillis() + ".png");
            try (FileOutputStream output = new FileOutputStream(image)) {
                output.write(png);
            }
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", image);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "分享 Nordic Weekly");
            if (!(context instanceof Activity)) return "{\"ok\":false}";
            ((Activity) context).runOnUiThread(() -> context.startActivity(chooser));
            return "{\"ok\":true}";
        } catch (Exception error) {
            return "{\"ok\":false}";
        }
    }

    private byte[] decodePng(String data) {
        if (data == null || !data.startsWith("data:image/png;base64,") || data.length() > 8000000) return null;
        try {
            byte[] png = Base64.decode(data.substring(22), Base64.DEFAULT);
            byte[] signature = {(byte)137, 80, 78, 71, 13, 10, 26, 10};
            if (png.length < 8) return null;
            for (int i = 0; i < 8; i++) if (png[i] != signature[i]) return null;
            return png;
        } catch (IllegalArgumentException error) {
            return null;
        }
    }
}
