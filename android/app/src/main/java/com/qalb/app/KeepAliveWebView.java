package com.qalb.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * Qalb — KeepAliveWebView
 *
 * Screen lock / app background hone par Android WebView ko "invisible"
 * treat karke Chromium media (YouTube IFrame audio) rok deta hai.
 * Ye subclass window/view visibility ko HAMESHA VISIBLE report karwata
 * hai — isliye naat screen band hone ke baad bhi chalti rehti hai.
 *
 * PlaybackService (foreground service + wake lock) iske saath mil kar
 * process ko Doze se bachata hai.
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
