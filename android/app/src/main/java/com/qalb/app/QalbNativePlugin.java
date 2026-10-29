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
 */
@CapacitorPlugin(name = "QalbNative")
public class QalbNativePlugin extends Plugin {

    @PluginMethod
    public void startPlayback(PluginCall call) {
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
    }

    @PluginMethod
    public void updatePlayback(PluginCall call) {
        String title = call.getString("title", "Naat chal rahi hai");
        String artist = call.getString("artist", "Qalb");
        PlaybackService.updateMeta(getContext(), title, artist);
        call.resolve();
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        PlaybackService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setStatusBarStyle(PluginCall call) {
        boolean isDarkTheme = Boolean.TRUE.equals(call.getBoolean("dark"));
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        Window window = activity.getWindow();
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        // dark theme → light icons; light theme → dark icons
        controller.setAppearanceLightStatusBars(!isDarkTheme);
        controller.setAppearanceLightNavigationBars(!isDarkTheme);
        call.resolve();
    }
}
