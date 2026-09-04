package com.lewislee.nordicnutri;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new SecureStorageBridge(this), "NordicSecureStorage");
        getBridge().getWebView().addJavascriptInterface(new GoogleAuthBridge(this, getBridge().getWebView()), "NordicGoogleAuth");
    }
}
