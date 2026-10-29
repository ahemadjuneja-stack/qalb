package com.qalb.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.view.Window;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Qalb — Native bridge plugin
 *
 * JS (qalb-native.ts) isko call karta hai:
 *  - startPlayback / updatePlayback / stopPlayback → PlaybackService (background audio)
 *  - setStatusBarStyle → theme ke hisaab se status bar icons (light/dark)
 *
 * CRASH-SAFETY (v0.2.1-24): Capacitor @PluginMethod bodies ko khud wrap nahi
 * karta — native exception = seedha app force-close. Isliye HAR method try/catch
 * me hai: kisi bhi OEM ROM / API level ka bug ab app crash nahi kar sakta,
 * sirf call reject hoti hai (JS side pehle se catch karta hai).
 */
@CapacitorPlugin(name = "QalbNative")
public class QalbNativePlugin extends Plugin {

    @PluginMethod
    public void startPlayback(PluginCall call) {
        try {
            String title = call.getString("title", "Naat chal rahi hai");
            String artist = call.getString("artist", "Qalb");

            PlaybackService.start(getContext(), title, artist);

            // Android 13+: notification permission (pehli dafa) — audio isse affected nahi
            Activity activity = getActivity();
            if (activity != null && Build.VERSION.SDK_INT >= 33) {
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                            activity, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9101);
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("playback start fail: " + safeMsg(e));
        }
    }

    @PluginMethod
    public void updatePlayback(PluginCall call) {
        try {
            String title = call.getString("title", "Naat chal rahi hai");
            String artist = call.getString("artist", "Qalb");
            PlaybackService.updateMeta(getContext(), title, artist);
            call.resolve();
        } catch (Exception e) {
            call.reject("playback meta fail: " + safeMsg(e));
        }
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        try {
            PlaybackService.stop(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("playback stop fail: " + safeMsg(e));
        }
    }

    @PluginMethod
    public void setStatusBarStyle(PluginCall call) {
        try {
            boolean isDarkTheme = Boolean.TRUE.equals(call.getBoolean("dark"));
            Activity activity = getActivity();
            if (activity == null || activity.isFinishing()) {
                call.resolve();
                return;
            }
            Window window = activity.getWindow();
            if (window == null || window.getDecorView() == null) {
                call.resolve();
                return;
            }
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller == null) {
                // kuch OEM ROMs pe insets controller null aata hai — skip, crash nahi
                call.resolve();
                return;
            }
            // dark theme → light icons; light theme → dark icons
            controller.setAppearanceLightStatusBars(!isDarkTheme);
            controller.setAppearanceLightNavigationBars(!isDarkTheme);
            call.resolve();
        } catch (Exception e) {
            // status bar styling fail = cosmetic issue — app chalti rahegi
            call.reject("status bar style fail: " + safeMsg(e));
        }
    }

    private String safeMsg(Exception e) {
        String m = e.getMessage();
        return m != null ? m : e.getClass().getSimpleName();
    }

    // ── Crash Guard (CrashGuard.java) — boot health + recovery ──────

    /** JS 12 sec stable chal gaya → native boot counter reset */
    @PluginMethod
    public void markSessionOk(PluginCall call) {
        CrashGuard.markSessionOk(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getBootHealth(PluginCall call) {
        int count = CrashGuard.bootCount(getContext());
        JSObject res = new JSObject();
        res.put("bootCount", count);
        res.put("crashLoop", CrashGuard.crashLoop(getContext()));
        call.resolve(res);
    }

    /** Pichli session ka hard-crash stack (JS ise crashLogs me report karega) */
    @PluginMethod
    public void getLastNativeCrash(PluginCall call) {
        JSObject res = new JSObject();
        res.put("crash", CrashGuard.readCrashFile(getContext()));
        call.resolve(res);
    }

    @PluginMethod
    public void clearNativeCrash(PluginCall call) {
        CrashGuard.clearCrashFile(getContext());
        call.resolve();
    }

    /** WebView storage factory-reset — "uninstall-reinstall" ka in-app replacement */
    @PluginMethod
    public void factoryResetWebView(PluginCall call) {
        JSObject res = new JSObject();
        try {
            com.getcapacitor.Bridge bridge = getBridge();
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().clearCache(true);
                bridge.getWebView().clearFormData();
                bridge.getWebView().clearHistory();
                bridge.getWebView().clearSslPreferences();
            }
            res.put("ok", true);
        } catch (Throwable t) {
            res.put("ok", false);
        }
        try {
            android.webkit.WebStorage.getInstance().deleteAllData();
            android.webkit.CookieManager.getInstance().removeAllCookies(null);
        } catch (Throwable ignored) {
        }
        call.resolve(res);
    }
}
