package com.qalb.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
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
 *  - startPlayback / updatePlayback / stopPlayback → PlaybackService (background audio
 *    + MediaSession lock-screen controls + thumbnail media notification)
 *  - setStatusBarStyle → theme ke hisaab se status bar icons (light/dark)
 *  - mediaAction event: notification/lock-screen buttons se JS player store control
 *
 * CRASH-SAFETY (v0.2.1-24): Capacitor @PluginMethod bodies ko khud wrap nahi
 * karta — native exception = seedha app force-close. Isliye HAR method try/catch
 * me hai: kisi bhi OEM ROM / API level ka bug ab app crash nahi kar sakta,
 * sirf call reject hoti hai (JS side pehle se catch karta hai).
 */
@CapacitorPlugin(name = "QalbNative")
public class QalbNativePlugin extends Plugin {

    /** PlaybackService → JS media button bridge */
    public interface MediaActionEmitter {
        void onMediaAction(String action);
    }

    private static volatile MediaActionEmitter mediaEmitter;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        mediaEmitter = action -> mainHandler.post(() -> {
            try {
                JSObject data = new JSObject();
                data.put("action", action);
                notifyListeners("mediaAction", data);
            } catch (Exception ignored) {
                // WebView dead / bridge down — notification buttons bas dead ho jayenge
            }
        });
    }

    /** PlaybackService se button press forward karne ke liye (static entry) */
    public static void emitMediaAction(String action) {
        MediaActionEmitter e = mediaEmitter;
        if (e != null) {
            try {
                e.onMediaAction(action);
            } catch (Exception ignored) {
            }
        }
    }

    @PluginMethod
    public void startPlayback(PluginCall call) {
        try {
            String title = call.getString("title", "Naat chal rahi hai");
            String artist = call.getString("artist", "Qalb");
            String thumbUrl = call.getString("thumbUrl", "");

            PlaybackService.start(getContext(), title, artist, thumbUrl);

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
            String thumbUrl = call.getString("thumbUrl", "");
            boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying"));
            double position = call.getDouble("position") != null ? call.getDouble("position") : 0d;
            double duration = call.getDouble("duration") != null ? call.getDouble("duration") : 0d;

            PlaybackService.updateMeta(getContext(), title, artist, thumbUrl, isPlaying, position, duration);
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
