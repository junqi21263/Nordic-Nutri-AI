package com.lewislee.nordicnutri;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AppUpdateBridgeTest {
    @Test
    public void acceptsOnlyHttpsApkUrls() {
        assertTrue(AppUpdateBridge.isSafeApkUrl("https://example.com/releases/app.apk"));
        assertFalse(AppUpdateBridge.isSafeApkUrl("http://example.com/app.apk"));
        assertFalse(AppUpdateBridge.isSafeApkUrl("file:///sdcard/app.apk"));
        assertFalse(AppUpdateBridge.isSafeApkUrl("https://example.com/app.zip"));
    }

    @Test
    public void acceptsMarketAndHttpsStoreUrlsOnly() {
        assertTrue(AppUpdateBridge.isSafeMarketUrl("market://details?id=com.lewislee.nordicnutri"));
        assertTrue(AppUpdateBridge.isSafeMarketUrl("https://play.google.com/store/apps/details?id=com.lewislee.nordicnutri"));
        assertFalse(AppUpdateBridge.isSafeMarketUrl("intent://malicious"));
        assertFalse(AppUpdateBridge.isSafeMarketUrl("javascript:alert(1)"));
    }

    @Test
    public void validatesSha256BeforeDownload() {
        assertTrue(AppUpdateBridge.isSha256("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"));
        assertFalse(AppUpdateBridge.isSha256("ABCDEF"));
        assertFalse(AppUpdateBridge.isSha256("../update.apk"));
    }
}
