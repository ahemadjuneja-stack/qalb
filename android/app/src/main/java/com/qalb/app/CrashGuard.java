package com.qalb.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebStorage;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.PrintWriter;

/**
 * Qalb — Native Crash Guard (Layer 1)
 *
 * Play Store nahi hai → app ko KHUD recover karna hai:
 *   - har onCreate pe boot_count++ (SharedPreferences)
 *   - JS 12 sec stable chal jaye → markSessionOk() se counter reset
 *   - 3+ boots without session-ok  → JS Safe Mode dikhata hai
 *   - 6+ boots without session-ok  → JS bilkul mara hua hai → WebView
 *     data factory-reset (app_webview dir delete) — uninstall ki
 *     zaroorat khatam, agli boot fresh app khulti hai
 *
 * Hard crash stack bhi file me save hota hai — agli boot pe JS ise
 * Firestore `crashLogs` me report karta hai (crash-report.ts).
 */
public final class CrashGuard {
    static final String PREFS = "qalb_guard";
    static final String CRASH_FILE = "last_crash.txt";
    static final int THRESHOLD_SAFE_MODE = 3;
    static final int THRESHOLD_WIPE = 6;

    private CrashGuard() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** MainActivity.onCreate me sabse pehle call karo (WebView banna baaki ho) */
    public static void install(final Context ctx) {
        SharedPreferences p = prefs(ctx);
        int count = p.getInt("boot_count", 0) + 1;

        if (count >= THRESHOLD_WIPE) {
            // Nuclear recovery: JS 5+ baar boot hone se pehle hi mara —
            // WebView data wipe. Create se PEHLE ho raha hai to safe hai.
            try {
                wipeWebViewData(ctx);
            } catch (Throwable ignored) {
            }
            count = 1; // agli boot fresh — crash loop toota
        }
        p.edit().putInt("boot_count", count).apply();

        // Hard-crash logger: stack file me, agli boot pe JS report karega
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                File f = new File(ctx.getFilesDir(), CRASH_FILE);
                PrintWriter w = new PrintWriter(f);
                w.println("time=" + System.currentTimeMillis());
                w.println(Log.getStackTraceString(e));
                w.close();
            } catch (Throwable ignored) {
            }
            if (prev != null) prev.uncaughtException(t, e);
        });
    }

    private static void wipeWebViewData(Context ctx) {
        try {
            File dir = ctx.getDataDir();
            if (dir != null) deleteRecursive(new File(dir, "app_webview"));
        } catch (Throwable ignored) {
        }
        try {
            WebStorage.getInstance().deleteAllData();
            CookieManager.getInstance().removeAllCookies(null);
        } catch (Throwable ignored) {
        }
    }

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        File[] children = f.listFiles();
        if (children != null) {
            for (File c : children) deleteRecursive(c);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    /** JS 12 sec stable chal gaya — counter reset (QalbNative.markSessionOk) */
    public static void markSessionOk(Context ctx) {
        prefs(ctx).edit().putInt("boot_count", 0).apply();
    }

    public static int bootCount(Context ctx) {
        return prefs(ctx).getInt("boot_count", 0);
    }

    public static boolean crashLoop(Context ctx) {
        return bootCount(ctx) >= THRESHOLD_SAFE_MODE;
    }

    public static String readCrashFile(Context ctx) {
        try {
            File f = new File(ctx.getFilesDir(), CRASH_FILE);
            if (!f.exists()) return null;
            BufferedReader r = new BufferedReader(new FileReader(f));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null && sb.length() < 8000) {
                sb.append(line).append('\n');
            }
            r.close();
            return sb.length() > 0 ? sb.toString() : null;
        } catch (Throwable t) {
            return null;
        }
    }

    public static void clearCrashFile(Context ctx) {
        try {
            //noinspection ResultOfMethodCallIgnored
            new File(ctx.getFilesDir(), CRASH_FILE).delete();
        } catch (Throwable ignored) {
        }
    }
}
