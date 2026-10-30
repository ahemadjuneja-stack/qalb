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
 *  - minimizeApp → (safety only) app background; v0.2.4 se back root par
 *    JS ack karta hai — app minimize nahi hoti
 *  - mediaAction event: notification/lock-screen buttons se JS player store control
 *  - backButton event: Android back gesture → JS view-stack navigation (v0.2.2)
 *  - downloadVideo → reel offline download (v0.2.6): progressive mp4 ko
 *    MediaStore (Gallery → Movies → Qalb) me save + downloadProgress events
 *
 * CRASH-SAFETY (v0.2.1-26): Capacitor @PluginMethod bodies ko khud wrap nahi
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

    /** Native → JS back-gesture bridge (MainActivity se) */
    public interface BackEmitter {
        void onBack();
    }

    private static volatile MediaActionEmitter mediaEmitter;
    private static volatile BackEmitter backEmitter;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // ── Back navigation fallback state (v0.2.2) ──────────────────────
    private static volatile boolean backAcked = false;
    private static volatile Runnable backFallback;
    private static final long BACK_FALLBACK_MS = 500L;
    private static volatile java.lang.ref.WeakReference<Activity> backActivityRef;

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
        backEmitter = () -> mainHandler.post(() -> {
            try {
                notifyListeners("backButton", new JSObject());
            } catch (Exception ignored) {
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

    // ── Back button bridge (v0.2.2) ──────────────────────────────────

    /**
     * MainActivity back gesture → JS "backButton" event.
     * Safety: 500ms me JS ne ack nahi kiya (backHandled/minimizeApp se) —
     * yaani WebView dead ya purana cached JS — to native khud app ko
     * background bhej deta hai. Back kabhi "dead" nahi hota.
     */
    public static void emitBackButton(Activity activity) {
        try {
            backAcked = false;
            backActivityRef = new java.lang.ref.WeakReference<>(activity);
            BackEmitter e = backEmitter;
            if (e != null) e.onBack();

            Runnable old = backFallback;
            if (old != null) {
                new Handler(Looper.getMainLooper()).removeCallbacks(old);
            }
            Runnable fallback = () -> {
                try {
                    if (!backAcked) {
                        Activity a = backActivityRef != null ? backActivityRef.get() : null;
                        if (a != null && !a.isFinishing()) a.moveTaskToBack(true);
                    }
                } catch (Exception ignored) {
                }
            };
            backFallback = fallback;
            new Handler(Looper.getMainLooper()).postDelayed(fallback, BACK_FALLBACK_MS);
        } catch (Exception ignored) {
        }
    }

    /** JS ne back handle kar liya — native fallback cancel */
    private static void ackBackButton() {
        backAcked = true;
        Runnable f = backFallback;
        if (f != null) {
            try {
                new Handler(Looper.getMainLooper()).removeCallbacks(f);
            } catch (Exception ignored) {
            }
        }
    }

    /** JS: "maine back handle kar liya (modal/sheet/tab band kiya)" */
    @PluginMethod
    public void backHandled(PluginCall call) {
        try {
            ackBackButton();
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    /** JS: "kuch nahi khula — app ko background karo (home-button jaisa)" */
    @PluginMethod
    public void minimizeApp(PluginCall call) {
        try {
            ackBackButton();
            Activity activity = getActivity();
            if (activity != null && !activity.isFinishing()) {
                activity.moveTaskToBack(true);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("minimize fail: " + safeMsg(e));
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

    // ── Reel offline download (v0.2.6) ─────────────────────────────
    // InnerTube progressive mp4 URL ko native HTTP se download karke
    // Gallery (Movies/Qalb) me save karta hai — WebView CORS yahan
    // apply nahi hota, isliye googlevideo.com direct ja sakta hai.
    // JS ko downloadProgress events milti hain (percent 0-99).

    /** downloadId → cancelRequested (JS cancelDownload() se set hota hai) */
    private static final java.util.concurrent.ConcurrentHashMap<String, Boolean> downloadCancels =
            new java.util.concurrent.ConcurrentHashMap<>();

    @PluginMethod
    public void downloadVideo(PluginCall call) {
        try {
            final String url = call.getString("url", "");
            final String filename = call.getString("filename", "Qalb-reel.mp4").replaceAll("[^A-Za-z0-9._-]", "");
            final String id = call.getString("id", "reel");
            if (url == null || !url.startsWith("http")) {
                call.reject("download: invalid url");
                return;
            }
            downloadCancels.remove(id);
            final android.content.Context ctx = getContext().getApplicationContext();
            Thread worker = new Thread(() -> {
                android.net.Uri savedUri = null;
                try {
                    java.net.HttpURLConnection conn =
                            (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent",
                            "com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip");
                    int code = conn.getResponseCode();
                    if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
                    long total = conn.getContentLengthLong();
                    java.io.InputStream in = new java.io.BufferedInputStream(conn.getInputStream(), 64 * 1024);

                    if (Build.VERSION.SDK_INT >= 29) {
                        // Gallery-visible save — MediaStore Movies/Qalb (permission-free)
                        android.content.ContentValues vals = new android.content.ContentValues();
                        vals.put(android.provider.MediaStore.Video.Media.DISPLAY_NAME, filename);
                        vals.put(android.provider.MediaStore.Video.Media.MIME_TYPE, "video/mp4");
                        vals.put(android.provider.MediaStore.Video.Media.RELATIVE_PATH,
                                android.os.Environment.DIRECTORY_MOVIES + "/Qalb");
                        vals.put(android.provider.MediaStore.Video.Media.IS_PENDING, 1);
                        savedUri = ctx.getContentResolver().insert(
                                android.provider.MediaStore.Video.Media.getContentUri(
                                        android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY), vals);
                        if (savedUri == null) throw new Exception("MediaStore insert fail");
                        try (java.io.OutputStream out = ctx.getContentResolver().openOutputStream(savedUri)) {
                            if (out == null) throw new Exception("output stream null");
                            copyWithProgress(in, out, total, id, filename);
                        }
                        vals.clear();
                        vals.put(android.provider.MediaStore.Video.Media.IS_PENDING, 0);
                        ctx.getContentResolver().update(savedUri, vals, null, null);
                    } else {
                        // legacy (API 24-28): app-specific dir — permission nahi lagta
                        java.io.File base = ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_MOVIES);
                        java.io.File dir = new java.io.File(base != null ? base : ctx.getFilesDir(), "Qalb");
                        if (!dir.exists() && !dir.mkdirs()) throw new Exception("dir create fail");
                        java.io.File outFile = new java.io.File(dir, filename);
                        try (java.io.OutputStream out = new java.io.FileOutputStream(outFile)) {
                            copyWithProgress(in, out, total, id, filename);
                        }
                        savedUri = android.net.Uri.fromFile(outFile);
                    }

                    JSObject res = new JSObject();
                    res.put("ok", true);
                    res.put("uri", savedUri != null ? savedUri.toString() : "");
                    res.put("gallery", Build.VERSION.SDK_INT >= 29);
                    call.resolve(res);
                } catch (Exception e) {
                    // adhoora MediaStore entry saaf karo (khali/kharab file gallery me na dikhe)
                    if (savedUri != null && Build.VERSION.SDK_INT >= 29) {
                        try {
                            ctx.getContentResolver().delete(savedUri, null, null);
                        } catch (Exception ignored) {
                        }
                    }
                    Boolean cancelled = downloadCancels.get(id);
                    if (cancelled != null && cancelled) {
                        call.reject("download cancelled");
                    } else {
                        call.reject("download fail: " + safeMsg(e));
                    }
                } finally {
                    downloadCancels.remove(id);
                }
            }, "qalb-reel-download");
            worker.setPriority(Thread.NORM_PRIORITY - 1);
            worker.start();
        } catch (Exception e) {
            call.reject("download start fail: " + safeMsg(e));
        }
    }

    private void copyWithProgress(java.io.InputStream in, java.io.OutputStream out,
                                  long total, String id, String filename) throws Exception {
        byte[] buf = new byte[64 * 1024];
        long done = 0;
        int lastPct = -1;
        long lastEmit = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            Boolean cancelled = downloadCancels.get(id);
            if (cancelled != null && cancelled) throw new Exception("cancelled");
            out.write(buf, 0, n);
            done += n;
            long now = System.currentTimeMillis();
            if (now - lastEmit > 400) { // max ~2.5 event/sec — bridge spam nahi
                lastEmit = now;
                int pct = total > 0 ? (int) Math.min(99, (done * 100) / total) : 0;
                if (pct != lastPct || total <= 0) {
                    lastPct = pct;
                    emitDownloadProgress(id, filename, pct);
                }
            }
        }
        out.flush();
    }

    private void emitDownloadProgress(String id, String filename, int pct) {
        mainHandler.post(() -> {
            try {
                JSObject d = new JSObject();
                d.put("id", id);
                d.put("filename", filename);
                d.put("percent", pct);
                notifyListeners("downloadProgress", d);
            } catch (Exception ignored) {
                // WebView dead — download phir bhi poora hoga
            }
        });
    }

    /** JS: "ye download cancel karo" (chal raha ho to copy loop me throw hota hai) */
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        try {
            String id = call.getString("id", "");
            if (id != null) downloadCancels.put(id, true);
        } catch (Exception ignored) {
        }
        call.resolve();
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
