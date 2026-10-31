package com.qalb.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Window;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

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

    // ── App background media pause (v0.3.3) ──────────────────────────
    // RULE: reel ka awaaz app minimize hote hi BAND (naat/qawwali player
    // background me chalta rahega). JS se iframe pause background me ho
    // hi nahi pata (WebView renderer freeze — v0.3.2 ka JS-only fix
    // isliye fail hua tha), isliye MainActivity app pause hone par
    // WebView.onPause() NATIVELY call karta hai — media pipeline
    // guaranteed rukti hai.
    private static volatile boolean bgPauseArmed = false;

    /** JS ReelsView set karta hai: reels dikh rahe + naat CHUP = true */
    @PluginMethod
    public void setBgPauseMedia(PluginCall call) {
        Boolean pause = call.getBoolean("pause", Boolean.FALSE);
        bgPauseArmed = Boolean.TRUE.equals(pause);
        call.resolve();
    }

    /** MainActivity.onPause() isse poochta hai */
    public static boolean shouldPauseMediaOnBg() {
        return bgPauseArmed;
    }

    // ── Google OAuth deep-link (v0.4.4) ─────────────────────────────
    // Chrome me consent ke baad Google qalb://oauth2redirect par redirect
    // karta hai. MainActivity wo URL yahan stash karta hai (cold-start
    // proof — app ka process Chrome me mar gaya ho tab bhi) AUR WebView
    // me 'qalbOauthRedirect' event dispatch karta hai (warm path). JS
    // consumeOauthRedirect() se pending URL le kar login complete karta hai.
    private static volatile String pendingOauthUrl;

    /** MainActivity se — naya redirect URL aaya */
    public static void setPendingOauthUrl(String url) {
        pendingOauthUrl = url;
    }

    /** JS: pending redirect URL lena (ek baar — read+clear) */
    @PluginMethod
    public void consumeOauthRedirect(PluginCall call) {
        JSObject res = new JSObject();
        try {
            String u = pendingOauthUrl;
            pendingOauthUrl = null;
            res.put("url", u);
        } catch (Exception e) {
            res.put("url", null);
        }
        call.resolve(res);
    }

    /**
     * JS: URL system browser (Chrome) me kholna — Google OAuth ka main
     * path. Sirf https:// (custom scheme / intent:// abuse se bachao).
     */
    @PluginMethod
    public void openExternal(PluginCall call) {
        try {
            String url = call.getString("url", "");
            if (url == null || !url.startsWith("https://")) {
                call.reject("openExternal: sirf https urls allowed");
                return;
            }
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("openExternal: activity nahi");
                return;
            }
            android.content.Intent i = new android.content.Intent(
                    android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("browser nahi khula: " + safeMsg(e));
        }
    }

    /**
     * JS: loopback OAuth server start (Google ka official installed-app
     * flow — console custom scheme nahi deta). Chrome me consent ke baad
     * Google http://127.0.0.1:PORT/oauth2redirect par redirect karta hai;
     * QalbOauth query ko qalb:// fake deep-link me wrap karke yahan
     * pahunchata hai → pending static + WebView event (dono channels).
     */
    @PluginMethod
    public void startOauthServer(PluginCall call) {
        try {
            Integer pref = call.getInt("port");
            final int preferred = pref != null ? pref : 7849;
            final com.getcapacitor.Bridge b = getBridge();
            final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
            int port = QalbOauth.start(preferred, url -> {
                setPendingOauthUrl(url);
                main.post(() -> {
                    try {
                        if (b != null && b.getWebView() != null) {
                            String json = org.json.JSONObject.quote(url);
                            b.getWebView().evaluateJavascript(
                                "try{window.dispatchEvent(new CustomEvent('qalbOauthRedirect',"
                                    + "{detail:{url:" + json + "}}))}catch(e){}",
                                null);
                        }
                    } catch (Exception ignored) {
                    }
                });
            });
            if (port < 0) {
                call.reject("oauth server bind fail (ports busy)");
                return;
            }
            JSObject res = new JSObject();
            res.put("port", port);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("oauth server fail: " + safeMsg(e));
        }
    }

    /** JS: loopback OAuth server band (flow ke baad/timeout par) */
    @PluginMethod
    public void stopOauthServer(PluginCall call) {
        try {
            QalbOauth.stop();
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    /**
     * JS: Google ka ACCOUNT-PICKER SHEET app ke andar khulta hai (v0.4.5)
     * — Chrome bilkul nahi khulta. serverClientId = Web client id (Google
     * sheet us project ka id_token deti hai jiska Web client yahan pass
     * hota hai; app khud package+SHA-1 (Android client) se verify hoti hai).
     * Result @ActivityCallback googleIdTokenResult me aata hai.
     */
    @PluginMethod
    public void googleIdToken(PluginCall call) {
        try {
            String serverClientId = call.getString("serverClientId");
            if (serverClientId == null || serverClientId.trim().isEmpty()) {
                call.reject("no server client id");
                return;
            }
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("no activity");
                return;
            }
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(
                    GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestIdToken(serverClientId.trim())
                    .requestEmail()
                    .build();
            GoogleSignInClient client = GoogleSignIn.getClient(activity, gso);
            // purana device-session saaf — sheet hamesha fresh account-picker
            try {
                client.signOut();
            } catch (Exception ignored) {
            }
            googleSheetStartMs = android.os.SystemClock.elapsedRealtime();
            startActivityForResult(call, client.getSignInIntent(), "googleIdTokenResult");
        } catch (Exception e) {
            call.reject("google sheet fail: " + safeMsg(e));
        }
    }

    /** sheet launch ka time — instant RESULT_CANCELED = config fail, user cancel nahi */
    private long googleSheetStartMs;

    /** googleIdToken sheet ka result — idToken ya cancel/fail reason */
    @ActivityCallback
    private void googleIdTokenResult(PluginCall call, ActivityResult result) {
        if (call == null) return; // activity recreate — call mar gaya
        try {
            if (result.getResultCode() != Activity.RESULT_OK) {
                // Asli wajah nikaalo — Play Services RESULT_CANCELED intent me
                // bhi ApiException de sakta hai (10=DEVELOPER_ERROR: package/
                // SHA-1 kisi Android client se match nahi). Wajah mili to wahi
                // report hoti hai — JS us par Chrome fallback chalata hai.
                // Wajah na mile to: <600ms = sheet khulti hi band (config
                // fail), warna sach me user cancel.
                String apiCode = null;
                try {
                    Task<GoogleSignInAccount> t =
                            GoogleSignIn.getSignedInAccountFromIntent(result.getData());
                    Exception ex = t.getException();
                    if (ex instanceof ApiException) {
                        apiCode = "api-" + ((ApiException) ex).getStatusCode();
                    }
                } catch (Exception ignored) {
                }
                if (apiCode != null) {
                    call.reject(apiCode);
                    return;
                }
                long elapsed = android.os.SystemClock.elapsedRealtime() - googleSheetStartMs;
                call.reject(elapsed < 600 ? "sheet-fail-fast" : "cancelled");
                return;
            }
            Task<GoogleSignInAccount> task =
                    GoogleSignIn.getSignedInAccountFromIntent(result.getData());
            GoogleSignInAccount acc = task.getResult(ApiException.class);
            String idToken = acc.getIdToken();
            if (idToken == null || idToken.isEmpty()) {
                // sheet chala par token nahi mila — serverClientId ka client
                // sahi project me nahi hai, ya Web client missing
                call.reject("no-id-token");
                return;
            }
            JSObject res = new JSObject();
            res.put("idToken", idToken);
            res.put("email", acc.getEmail() == null ? "" : acc.getEmail());
            call.resolve(res);
        } catch (ApiException e) {
            // 13 = user cancel, 12500 = play-services/client config masla,
            // 10 = developer error (package/SHA-1 kisi Android client se match nahi)
            call.reject("api-" + e.getStatusCode());
        } catch (Exception e) {
            call.reject("google result fail: " + safeMsg(e));
        }
    }

    /**
     * JS: native HTTP POST (form body) — WebView ke DNS/CORS maslon ka
     * bypass (v0.4.5). Jaise Google token exchange: WebView me "Unable to
     * resolve host oauth2.googleapis.com" aa sakta hai, Android ka apna
     * stack (Chrome jaisa) resolve kar leta hai. Status + body wapas.
     */
    @PluginMethod
    public void httpPostForm(PluginCall call) {
        String url = call.getString("url");
        String body = call.getString("body");
        if (url == null || body == null || url.isEmpty()) {
            call.reject("bad-args");
            return;
        }
        try {
            HttpURLConnection conn =
                    (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(20_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            OutputStream os = conn.getOutputStream();
            os.write(body.getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();
            int status = conn.getResponseCode();
            InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            if (in != null) {
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                in.close();
            }
            JSObject res = new JSObject();
            res.put("status", status);
            res.put("body", bos.toString("UTF-8"));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("http-fail: " + e.getClass().getSimpleName());
        }
    }

    /** JS: device ka Google session saaf karo (fresh picker ke liye) */
    @PluginMethod
    public void googleSignOut(PluginCall call) {
        try {
            Activity activity = getActivity();
            if (activity != null) {
                GoogleSignIn.getClient(activity, GoogleSignInOptions.DEFAULT_SIGN_IN)
                        .signOut();
            }
        } catch (Exception ignored) {
        }
        call.resolve();
    }
}
