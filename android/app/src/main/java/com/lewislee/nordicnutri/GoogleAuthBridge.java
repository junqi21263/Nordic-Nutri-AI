package com.lewislee.nordicnutri;

import android.app.Activity;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.core.content.ContextCompat;

import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.security.SecureRandom;

final class GoogleAuthBridge {
    private final Activity activity;
    private final WebView webView;
    private final CredentialManager credentialManager;

    GoogleAuthBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.credentialManager = CredentialManager.create(activity);
    }

    @JavascriptInterface
    public void signIn(String serverClientId, String callbackId) {
        if (serverClientId == null || serverClientId.trim().isEmpty() || callbackId == null || callbackId.trim().isEmpty()) {
            resolve(callbackId, null, "Google sign-in is not configured");
            return;
        }
        activity.runOnUiThread(() -> requestCredential(serverClientId, callbackId));
    }

    private void requestCredential(String serverClientId, String callbackId) {
        GetGoogleIdOption googleOption = new GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(serverClientId)
                .setAutoSelectEnabled(false)
                .setNonce(randomNonce())
                .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(googleOption)
                .build();
        credentialManager.getCredentialAsync(
                activity,
                request,
                new CancellationSignal(),
                ContextCompat.getMainExecutor(activity),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential credential = response.getCredential();
                        if (!(credential instanceof CustomCredential)
                                || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            resolve(callbackId, null, "Google credential type is unsupported");
                            return;
                        }
                        try {
                            GoogleIdTokenCredential googleCredential = GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                            resolve(callbackId, googleCredential.getIdToken(), null);
                        } catch (Exception error) {
                            resolve(callbackId, null, "Google credential is invalid");
                        }
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        resolve(callbackId, null, "Google sign-in was cancelled or unavailable");
                    }
                });
    }

    private void resolve(String callbackId, String token, String error) {
        if (callbackId == null || callbackId.trim().isEmpty()) return;
        String id = JSONObject.quote(callbackId);
        String value = token == null ? "null" : JSONObject.quote(token);
        String failure = error == null ? "null" : JSONObject.quote(error);
        String script = "(function(){var c=window.__nordicGoogleAuthCallbacks&&window.__nordicGoogleAuthCallbacks[" + id + "];if(c){delete window.__nordicGoogleAuthCallbacks[" + id + "];if(" + value + "!==null)c.resolve(" + value + ");else c.reject(new Error(" + failure + "));}})();";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private static String randomNonce() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.encodeToString(bytes, Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING);
    }
}
