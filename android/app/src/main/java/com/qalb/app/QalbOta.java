package com.qalb.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.plugin.WebView;
import java.io.File;

/**
 * Qalb — OTA Web-Bundle state machine (v0.3.0, WhatsApp-style "restart par update")
 *
 * Capacitor 8 ka built-in live-update hook use hota hai:
 *   Bridge startup par CapWebViewSettings/serverBasePath pref me valid directory
 *   ho to WebView assets ki jagah usi directory se files serve karta hai.
 *
 * States (qalb_ota prefs):
 *   ready     → bundle download+verify ho chuka, pref set — agla start serve karega
 *   active    → is session me naya bundle serve ho raha hai, JS ne abhi OK nahi bola
 *   active_ok → JS boot ho gaya (UpdaterPlugin.markBundleOk) — bundle trusted
 *
 * Rollback (MainActivity.onCreate, Bridge banne se PEHLE):
 *   • state=active (pichla boot JS tak pahuncha hi nahi) → bundle delete + pref clear
 *   • APK versionCode badal gaya (naya APK)              → bundle delete + pref clear
 *     (Capacitor ka isNewBinary() bhi serverBasePath pref khud clear karta hai)
 *
 * Worst case: kharab bundle ka SIRF EK kharab session — agle start par khud
 * assets par revert, aur agli check par bundle dobara download ho lega.
 */
final class QalbOta {

    private static final String PREFS = "qalb_ota";
    static final String K_STATE = "state"; // ready | active | active_ok
    static final String K_PATH = "path";   // bundle directory (absolute)
    static final String K_CODE = "code";   // bundle versionCode (CI run number)
    static final String K_BIN = "bin";     // APK versionCode jab bundle set hua tha

    private QalbOta() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String apkVersionCode(Context ctx) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return String.valueOf(PackageInfoCompat.getLongVersionCode(pi));
        } catch (Exception e) {
            return "0";
        }
    }

    /** MainActivity.onCreate me super.onCreate se PEHLE chalao. */
    static void bootstrap(Context ctx) {
        try {
            SharedPreferences p = prefs(ctx);
            String state = p.getString(K_STATE, null);
            String path = p.getString(K_PATH, null);
            if (state == null || path == null || path.isEmpty()) return;

            SharedPreferences cap = ctx.getSharedPreferences(
                    WebView.WEBVIEW_PREFS_NAME, Context.MODE_PRIVATE);

            // APK update hua? → purana bundle gaya (naya APK apna fresh bundle laata hai)
            if (!apkVersionCode(ctx).equals(p.getString(K_BIN, null))) {
                deleteTree(new File(path));
                p.edit().clear().apply();
                cap.edit().putString(WebView.CAP_SERVER_PATH, "").apply();
                return;
            }

            if ("active".equals(state)) {
                // Pichla boot naye bundle par JS tak pahuncha hi nahi → kharab bundle
                deleteTree(new File(path));
                p.edit().clear().apply();
                cap.edit().putString(WebView.CAP_SERVER_PATH, "").apply();
                return;
            }

            if ("ready".equals(state)) {
                // Ye session naya bundle serve karega
                // (serverBasePath pref download ke waqt set ho chuki hai)
                p.edit().putString(K_STATE, "active").apply();
            }
            // active_ok → sab theek, bundle chalta rahega
        } catch (Exception ignored) {
            // OTA kabhi app start ko rok hi nahi sakta
        }
    }

    static void deleteTree(File f) {
        try {
            File[] kids = f.listFiles();
            if (kids != null) {
                for (File k : kids) deleteTree(k);
            }
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        } catch (Exception ignored) {
        }
    }
}
