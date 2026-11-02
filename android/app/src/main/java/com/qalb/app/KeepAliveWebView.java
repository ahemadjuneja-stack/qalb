package com.qalb.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * Qalb — KeepAliveWebView
 *
 * v0.5.35 — BACKGROUND PLAYBACK RESTORED (user decision)
 *
 * User ka informed faisla (private app, sirf dosto ke beech, offline
 * download feature pehle hi poora removed): screen lock / app background
 * par naat-qawwali audio chalta RAHE. Isliye ye class wapis apne asli
 * kaam par — window/view visibility ko hamesha VISIBLE report karwata
 * hai, warna Chromium (WebView) screen band hote hi YouTube IFrame ka
 * media pause kar deta hai.
 *
 * Saathi components (teenon milkar background playback banate hain):
 *  1. PlaybackService  — foreground service (FGS) + notification card +
 *     PARTIAL_WAKE_LOCK — process Doze/freezing se bacha rehta hai
 *  2. KeepAliveWebView (ye class) — WebView ka media pipeline zinda
 *  3. MainActivity.onPause — sirf reels ke waqt WebView pause karta hai
 *     (bgPauseArmed flag), naat ke waqt NAHI
 */
public class KeepAliveWebView extends CapacitorWebView {

    public KeepAliveWebView(Context context) {
        // Capacitor 8 me CapacitorWebView ka sirf (Context, AttributeSet) constructor hai
        this(context, null);
    }

    public KeepAliveWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        // Hamesha system ko VISIBLE batao — warna Chromium audio pause kar deta hai
        super.onWindowVisibilityChanged(View.VISIBLE);
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, View.VISIBLE);
    }
}
