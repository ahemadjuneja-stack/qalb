package com.qalb.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Qalb — HTML5/YT FULLSCREEN SUPPORT (v0.5.24)
 *
 * User report: "youtube ki tarha full screen display fix nahi dikhti,
 * niche forward ki line/timing nahi aati, display cut ho rahi hai."
 *
 * ROOT CAUSE: Capacitor ka BridgeWebChromeClient fullscreen request ko
 * FORAN reject kar deta hai (callback.onCustomViewHidden()) — YT embed
 * apna iframe fullscreen CSS laga deta hai lekin WebView us view ko
 * screen-size container me NAHI deta → hamare 16:9 box me clip ho jata
 * hai (display cut), aur YT ke controls (seekbar line + timing) iframe
 * ke bottom par hote hain jo clip ke bahar reh jate hain.
 *
 * v0.5.30 — USER REPORT: "YouTube play hone par notification bar hide
 * aur full view milta hai; iTube me notification bar bhi hai, side ki
 * alag border bhi dikh rahi hai." Screenshot analysis: fullscreen me
 * (1) status bar dikhta rehta tha, (2) landscape me LEFT black strip —
 * ye display-cutout ka LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT letterbox
 * hai (punch-hole camera wali column ke aar-paar window nahi jaati).
 * YouTube dono nahi dikhata kyunki wo immersive (bars hide) + cutout
 * SHORT_EDGES use karta hai.
 *
 * FIX: onShowCustomView par IMMERSIVE (status+nav bars hide, swipe par
 * transient) + cutout SHORT_EDGES — video poore screen ko palle-bhar
 * leta hai (punch-hole ke aar-paar bhi). Exit par sab restore.
 *
 * FIX: proper onShowCustomView/onHideCustomView — fullscreen content ko
 * decor par MATCH_PARENT black container me daalo, WebView chhupao,
 * landscape lock (YouTube jaisa), exit par sab restore.
 *
 * Isse dono raste theek hote hain: (1) YT embed ka apna fullscreen
 * button, (2) watch-screen ka apna fullscreen button (element fullscreen
 * request) — dono me YT ke ASLI controls (seekbar + timing) aayenge.
 */
public class QalbWebChromeClient extends BridgeWebChromeClient {

    private final Bridge bridge;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ViewGroup fullscreenContainer;

    public QalbWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        // pehle se fullscreen hai? naye request ko turant cancel
        if (customView != null || fullscreenContainer != null) {
            callback.onCustomViewHidden();
            return;
        }
        Activity activity = bridge.getActivity();
        if (activity == null || activity.isFinishing()) {
            callback.onCustomViewHidden();
            return;
        }
        try {
            customView = view;
            customViewCallback = callback;

            // YouTube jaisa: fullscreen me landscape
            activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

            // v0.5.30 — YouTube ka asli full view: bars gayab + cutout ke
            // aar-paar (left black-strip + status bar dono khatam)
            enterImmersive(activity);

            fullscreenContainer = new FrameLayout(activity);
            fullscreenContainer.setBackgroundColor(0xFF000000);
            fullscreenContainer.addView(
                view,
                new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            );
            ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
            decor.addView(
                fullscreenContainer,
                new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            );

            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.setVisibility(View.INVISIBLE);
            }
        } catch (Exception e) {
            // koi bhi gadbad — fullscreen cancel, app normal rahe
            teardownCustomView();
            callback.onCustomViewHidden();
        }
    }

    @Override
    public void onHideCustomView() {
        teardownCustomView();
        super.onHideCustomView();
    }

    /** fullscreen ke dauran system bars hide + cutout SHORT_EDGES (v0.5.30) */
    private void enterImmersive(Activity activity) {
        try {
            Window window = activity.getWindow();
            if (window == null || window.getDecorView() == null) return;
            if (Build.VERSION.SDK_INT >= 28) {
                try {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                    window.setAttributes(lp);
                } catch (Exception ignored) {
                    // purani API par cutout mode optional
                }
            }
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller == null) return;
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.statusBars()
                    | WindowInsetsCompat.Type.navigationBars());
        } catch (Exception ignored) {
            // cosmetic fail — fullscreen waise hi chalega
        }
    }

    /** fullscreen exit — bars + cutout wapis (v0.5.30) */
    private void exitImmersive(Activity activity) {
        try {
            Window window = activity.getWindow();
            if (window == null || window.getDecorView() == null) return;
            if (Build.VERSION.SDK_INT >= 28) {
                try {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                    window.setAttributes(lp);
                } catch (Exception ignored) {
                }
            }
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller == null) return;
            controller.show(WindowInsetsCompat.Type.statusBars()
                    | WindowInsetsCompat.Type.navigationBars());
        } catch (Exception ignored) {
        }
    }

    private void teardownCustomView() {
        Activity activity = bridge.getActivity();
        try {
            // v0.5.30 — pehle bars/cutout restore (activity null ho to bhi try)
            if (activity != null) exitImmersive(activity);
            if (fullscreenContainer != null && fullscreenContainer.getParent() instanceof ViewGroup) {
                ((ViewGroup) fullscreenContainer.getParent()).removeView(fullscreenContainer);
            }
            fullscreenContainer = null;
            if (customView != null && customView.getParent() instanceof ViewGroup) {
                ((ViewGroup) customView.getParent()).removeView(customView);
            }
            customView = null;
            if (activity != null) {
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            }
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.setVisibility(View.VISIBLE);
            }
            if (customViewCallback != null) {
                try {
                    customViewCallback.onCustomViewHidden();
                } catch (Exception ignored) {
                }
                customViewCallback = null;
            }
        } catch (Exception ignored) {
            customView = null;
            fullscreenContainer = null;
            customViewCallback = null;
        }
    }
}
