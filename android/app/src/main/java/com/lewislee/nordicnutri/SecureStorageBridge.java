package com.lewislee.nordicnutri;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

final class SecureStorageBridge {
    private static final String PREFS_NAME = "nordic_secure_storage";
    private static final String KEY_ALIAS = "nordic_auth_token_key";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SharedPreferences preferences;

    SecureStorageBridge(Context context) {
        preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public synchronized String get(String key) {
        if (!validKey(key)) return null;
        String encoded = preferences.getString(key, null);
        if (encoded == null) return null;
        try {
            byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
            if (packed.length <= IV_LENGTH_BYTES) return null;
            byte[] iv = new byte[IV_LENGTH_BYTES];
            byte[] ciphertext = new byte[packed.length - IV_LENGTH_BYTES];
            System.arraycopy(packed, 0, iv, 0, IV_LENGTH_BYTES);
            System.arraycopy(packed, IV_LENGTH_BYTES, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, loadKey(), new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return null;
        }
    }

    @JavascriptInterface
    public synchronized void set(String key, String value) {
        if (!validKey(key) || value == null) return;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            // AndroidKeyStore requires provider-generated IVs for randomized encryption.
            cipher.init(Cipher.ENCRYPT_MODE, loadKey());
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] packed = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, packed, 0, iv.length);
            System.arraycopy(ciphertext, 0, packed, iv.length, ciphertext.length);
            if (!preferences.edit().putString(key, Base64.encodeToString(packed, Base64.NO_WRAP)).commit()) {
                throw new IllegalStateException("Secure storage write failed");
            }
        } catch (Exception ignored) {
            // Never include credentials in logs or fall back to plaintext.
            android.util.Log.e("NordicSecureStorage", "Secure storage write failed");
        }
    }

    @JavascriptInterface
    public synchronized void remove(String key) {
        if (validKey(key)) preferences.edit().remove(key).apply();
    }

    private static boolean validKey(String key) {
        return key != null && !key.isEmpty() && key.length() <= 128;
    }

    private static SecretKey loadKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }
}
