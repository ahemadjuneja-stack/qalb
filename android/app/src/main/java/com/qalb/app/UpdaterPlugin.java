package com.qalb.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Qalb — In-App Auto Updater (native layer)
 * Shivam Staff app style: native APK download (progress + resume + retry)
 * aur FileProvider se install intent.
 *
 * JS side: src/plugins/updater.ts (bridge) + src/lib/update-engine.ts (flow)
 */
@CapacitorPlugin(name = "UpdaterPlugin")
public class UpdaterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private volatile HttpURLConnection activeConnection = null;

    private File apkDir() {
        Context ctx = getContext();
        File dir = ctx.getExternalFilesDir("apk");
        if (dir == null) dir = new File(ctx.getFilesDir(), "apk");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File targetApk(String versionCode) {
        return new File(apkDir(), "qalb-update-" + versionCode + ".apk");
    }

    /** Pehle se download hua APK hai? (app restart ke baad bhi) */
    @PluginMethod
    public void getReadyApk(PluginCall call) {
        try {
            String vc = call.getString("versionCode");
            if (vc == null) {
                call.resolve(new JSObject().put("path", null));
                return;
            }
            File f = targetApk(vc);
            JSObject res = new JSObject();
            res.put("path", (f.exists() && f.length() > 0) ? f.getAbsolutePath() : null);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("ready apk check fail: " + safeMsg(e));
        }
    }

    /**
     * APK download — resume support (Range header), 3 retry, progress events.
     * Progress: notifyListeners("progress", {percent, downloaded, total})
     */
    @PluginMethod
    public void downloadApk(PluginCall call) {
        final String url = call.getString("url");
        final String vc = call.getString("versionCode");
        if (url == null || vc == null) {
            call.reject("url/versionCode missing");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("download already running");
            return;
        }
        final File dest = targetApk(vc);
        final File part = new File(dest.getAbsolutePath() + ".part");

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    // purana adhoora .part ho to delete (resume complexity se bachne ke liye
                    // simple re-download — 3 retry ke saath kaafi reliable hai)
                    if (part.exists()) part.delete();

                    IOExceptionHolder holder = new IOExceptionHolder();
                    boolean ok = false;
                    for (int attempt = 1; attempt <= 3 && !ok; attempt++) {
                        ok = downloadOnce(url, part, holder, attempt);
                        if (!ok && attempt < 3) {
                            Thread.sleep(2000L * attempt); // backoff
                        }
                    }

                    if (ok && part.exists() && part.length() > 0) {
                        if (dest.exists()) dest.delete();
                        if (part.renameTo(dest)) {
                            JSObject res = new JSObject().put("path", dest.getAbsolutePath());
                            call.resolve(res);
                        } else {
                            call.reject("APK rename fail");
                        }
                    } else {
                        call.reject("Download fail: " + holder.message);
                    }
                } catch (Exception e) {
                    call.reject("Download error: " + safeMsg(e));
                } finally {
                    downloading.set(false);
                    activeConnection = null;
                }
            }
        });
    }

    private static class IOExceptionHolder {
        String message = "unknown";
    }

    private boolean downloadOnce(String urlStr, File part, IOExceptionHolder holder, int attempt) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod("GET");
            activeConnection = conn;

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                holder.message = "HTTP " + code + " (attempt " + attempt + ")";
                return false;
            }

            long total = conn.getContentLength();
            InputStream in = conn.getInputStream();
            FileOutputStream out = new FileOutputStream(part, false);
            byte[] buf = new byte[8192];
            long done = 0;
            int lastPct = -1;
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    if (pct != lastPct) {
                        lastPct = pct;
                        JSObject prog = new JSObject();
                        prog.put("percent", pct);
                        prog.put("downloaded", done);
                        prog.put("total", total);
                        notifyListeners("progress", prog);
                    }
                }
            }
            out.flush();
            out.close();
            in.close();
            if (total > 0 && done < total) {
                holder.message = "incomplete (" + done + "/" + total + ")";
                return false;
            }
            return true;
        } catch (Exception e) {
            holder.message = safeMsg(e) + " (attempt " + attempt + ")";
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Install intent — pehli baar "unknown apps" permission chahiye ho to settings khud khul jati hai
     *  (openSettings=false → sirf check, settings nahi kholte — auto-retry ke liye) */
    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        boolean openSettings = call.getBoolean("openSettings", true);
        if (path == null) {
            call.reject("path missing");
            return;
        }
        try {
            Activity activity = getActivity();
            final Context ctx = activity != null ? activity : getContext();
            File apk = new File(path);
            if (!apk.exists()) {
                call.reject("APK file missing: " + path);
                return;
            }

            // Android 8+ par install permission check — nahi hai to SETTINGS SCREEN
            // KHUD KHOLO (openSettings=true ho to; auto-retry me sirf silent check)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PackageManager pm = ctx.getPackageManager();
                if (!pm.canRequestPackageInstalls()) {
                    if (openSettings) {
                        try {
                            Intent si = new Intent(
                                    android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + ctx.getPackageName()));
                            si.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            ctx.startActivity(si);
                        } catch (Exception ignored) {
                            // kuch OEMs pe direct screen nahi milti — JS side button fallback hai
                        }
                    }
                    call.resolve(new JSObject()
                            .put("ok", false)
                            .put("needsPermission", true));
                    return;
                }
            }

            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);

            // ACTION_INSTALL_PACKAGE (explicit installer) — na mile to ACTION_VIEW fallback
            try {
                Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (activity != null) {
                    activity.startActivity(intent);
                } else {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(intent);
                }
            } catch (ActivityNotFoundException e) {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            }
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Install error: " + safeMsg(e));
        }
    }

    /** "Install unknown apps" permission wali system settings screen kholo */
    @PluginMethod
    public void openPermissionSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent i = new Intent(
                        android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Settings open error: " + safeMsg(e));
        }
    }

    /** Purane versionCode ke APK clean — keepVc SE BADE ya barabar version wale
     *  APK SURAKSHIT rehte hain (pending update ka downloaded APK delete nahi hota).
     *  .part (adhoora download) hamesha delete. */
    @PluginMethod
    public void cleanStale(PluginCall call) {
        String keepVc = call.getString("versionCode");
        long keepNum = -1;
        if (keepVc != null) {
            try { keepNum = Long.parseLong(keepVc.trim()); } catch (Exception ignored) {}
        }
        try {
            File[] files = apkDir().listFiles();
            if (files != null) {
                java.util.regex.Pattern p =
                        java.util.regex.Pattern.compile("qalb-update-(\\d+)\\.apk$");
                for (File f : files) {
                    String name = f.getName();
                    if (name.endsWith(".part")) { f.delete(); continue; }
                    if (!name.endsWith(".apk")) continue;
                    java.util.regex.Matcher m = p.matcher(name);
                    long vc = m.find() ? Long.parseLong(m.group(1)) : -1;
                    // vc < keepNum → purana APK, delete. vc >= keepNum → pending naya, rakho.
                    if (vc >= 0 && keepNum >= 0 && vc < keepNum) f.delete();
                    else if (vc < 0 && keepNum >= 0) f.delete(); // unknown naam — stale
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Clean error: " + safeMsg(e));
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  OTA Web Bundle (v0.3.0) — WhatsApp-style silent live update
    //  Chote web fixes APK install ke bina: zip download → verify →
    //  unzip → agla app start isi bundle se chalega (Capacitor 8
    //  built-in live update: CapWebViewSettings/serverBasePath pref).
    //  State machine + rollback: QalbOta.java
    // ══════════════════════════════════════════════════════════════

    /** Installed APK ka REAL versionCode/versionName — update-engine isse
     *  compare karta hai (APP_BUILD bundle ke sath aata hai, APK ka nahi:
     *  OTA lage chuke bundle me wo aage badh chuka hota hai). */
    @PluginMethod
    public void getNativeVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            JSObject res = new JSObject();
            res.put("versionCode", PackageInfoCompat.getLongVersionCode(pi));
            res.put("versionName", pi.versionName != null ? pi.versionName : "");
            call.resolve(res);
        } catch (Exception e) {
            call.reject("version fail: " + safeMsg(e));
        }
    }

    /** Current OTA state — {state: none|ready|active|active_ok, code, path} */
    @PluginMethod
    public void getOtaState(PluginCall call) {
        try {
            Context ctx = getContext();
            SharedPreferences p = QalbOta.prefs(ctx);
            JSObject res = new JSObject();
            res.put("state", p.getString(QalbOta.K_STATE, "none"));
            res.put("code", p.getLong(QalbOta.K_CODE, 0L));
            res.put("path", p.getString(QalbOta.K_PATH, null));
            res.put("versionCode", Long.parseLong(QalbOta.apkVersionCode(ctx)));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("ota state fail: " + safeMsg(e));
        }
    }

    /** JS boot safe ho gaya (shell mount) → bundle trusted, ab rollback nahi hoga. */
    @PluginMethod
    public void markBundleOk(PluginCall call) {
        try {
            SharedPreferences p = QalbOta.prefs(getContext());
            if ("active".equals(p.getString(QalbOta.K_STATE, null))) {
                p.edit().putString(QalbOta.K_STATE, "active_ok").apply();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("markOk fail: " + safeMsg(e));
        }
    }

    /**
     * Web bundle (OTA) download + sha256 verify + unzip + validate.
     * Sab theek to state=ready + Capacitor serverBasePath pref set —
     * AGLA app start isi bundle se chalega (ye session nahi badalta).
     * Fail hone par kuch nahi badalta — purana bundle hi chalta rahega.
     */
    @PluginMethod
    public void downloadWebBundle(PluginCall call) {
        final String url = call.getString("url");
        final String code = call.getString("code");
        final String sha = call.getString("sha256");
        if (url == null || code == null) {
            call.reject("url/code missing");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("download already running");
            return;
        }
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Context ctx = getContext();
                    File root = new File(ctx.getFilesDir(), "ota");
                    File zip = new File(root, "bundle-" + code + ".zip");
                    File dest = new File(root, "b" + code);
                    if (!root.exists()) root.mkdirs();

                    IOExceptionHolder holder = new IOExceptionHolder();
                    boolean ok = false;
                    for (int attempt = 1; attempt <= 3 && !ok; attempt++) {
                        if (zip.exists()) zip.delete();
                        ok = downloadOnce(url, zip, holder, attempt);
                        if (!ok && attempt < 3) Thread.sleep(2000L * attempt);
                    }
                    if (!ok) {
                        call.reject("Bundle download fail: " + holder.message);
                        return;
                    }

                    // integrity (optional but CI hamesha sha256 bhejta hai)
                    if (sha != null && !sha.isEmpty() && !sha256Hex(zip).equalsIgnoreCase(sha)) {
                        call.reject("Bundle sha256 mismatch");
                        return;
                    }

                    // unzip (zip-slip safe) + validate
                    if (dest.exists()) QalbOta.deleteTree(dest);
                    unzip(zip, dest);
                    if (!new File(dest, "index.html").isFile()) {
                        QalbOta.deleteTree(dest);
                        call.reject("Bundle invalid (index.html missing)");
                        return;
                    }

                    // purane bundles/zips clean — sirf naya rakho
                    File[] kids = root.listFiles();
                    if (kids != null) {
                        for (File k : kids) {
                            if (k.equals(dest)) continue;
                            QalbOta.deleteTree(k);
                        }
                    }

                    SharedPreferences p = QalbOta.prefs(ctx);
                    p.edit()
                            .putString(QalbOta.K_STATE, "ready")
                            .putString(QalbOta.K_PATH, dest.getAbsolutePath())
                            .putLong(QalbOta.K_CODE, Long.parseLong(code.trim()))
                            .putString(QalbOta.K_BIN, QalbOta.apkVersionCode(ctx))
                            .apply();

                    // Capacitor built-in live-update pref — agla start isi dir se chalega
                    ctx.getSharedPreferences(
                            com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME,
                            Context.MODE_PRIVATE)
                            .edit()
                            .putString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH,
                                    dest.getAbsolutePath())
                            .apply();

                    JSObject res = new JSObject()
                            .put("path", dest.getAbsolutePath())
                            .put("code", code);
                    call.resolve(res);
                } catch (Exception e) {
                    call.reject("Bundle install fail: " + safeMsg(e));
                } finally {
                    downloading.set(false);
                    activeConnection = null;
                }
            }
        });
    }

    /** Manual recovery escape hatch — bundle hatao, assets par wapas. */
    @PluginMethod
    public void resetOta(PluginCall call) {
        try {
            Context ctx = getContext();
            SharedPreferences p = QalbOta.prefs(ctx);
            String path = p.getString(QalbOta.K_PATH, null);
            if (path != null) QalbOta.deleteTree(new File(path));
            p.edit().clear().apply();
            ctx.getSharedPreferences(
                    com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME,
                    Context.MODE_PRIVATE)
                    .edit()
                    .putString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, "")
                    .apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("ota reset fail: " + safeMsg(e));
        }
    }

    /** zip → dest (zip-slip guarded: entry hamesha dest ke andar). */
    private static void unzip(File zip, File dest) throws Exception {
        dest.mkdirs();
        String canonRoot = dest.getCanonicalPath() + File.separator;
        ZipInputStream zis = new ZipInputStream(new FileInputStream(zip));
        try {
            byte[] buf = new byte[8192];
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                File out = new File(dest, e.getName());
                if (!out.getCanonicalPath().startsWith(canonRoot)) {
                    throw new SecurityException("zip entry outside dest: " + e.getName());
                }
                if (e.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                FileOutputStream fo = new FileOutputStream(out);
                int n;
                while ((n = zis.read(buf)) != -1) fo.write(buf, 0, n);
                fo.close();
                zis.closeEntry();
            }
        } finally {
            try { zis.close(); } catch (Exception ignored) {}
        }
    }

    private static String sha256Hex(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        FileInputStream in = new FileInputStream(f);
        try {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
        } finally {
            try { in.close(); } catch (Exception ignored) {}
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        HttpURLConnection c = activeConnection;
        if (c != null) {
            try { c.disconnect(); } catch (Exception ignored) {}
        }
    }

    private String safeMsg(Exception e) {
        String m = e.getMessage();
        return m != null ? m : e.getClass().getSimpleName();
    }
}
