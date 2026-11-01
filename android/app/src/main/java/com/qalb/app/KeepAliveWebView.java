package com.qalb.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * Qalb — KeepAliveWebView
 *
 * v0.5.34 COMPLIANCE MODE — ye class ab INERT hai (kuch nahi karti).
 *
 * Pehle ye screen-lock/app-background par WebView ko HAMESHA VISIBLE
 * report karwata tha taaki YouTube IFrame ka audio background me chalta
 * rahe — wo YouTube ke rules ke khilaaf tha (player invisible + audio
 * chalta raha = Premium feature ka bypass).
 *
 * Ab: real visibility pass-through hoti hai — screen band / app background
 * hote hi WebView ka media NATURALLY pause ho jata hai (YouTube rules ke
 * mutabiq). Background sunne ka legal jugad = Picture-in-Picture
 * (MainActivity.onUserLeaveHint) — player VISIBLE rehta hai.
 *
 * Class remove NAHI ki (koi purana layout/ref toot na jaye) — bas no-op.
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
        // v0.5.34 — real visibility pass-through (compliance)
        super.onWindowVisibilityChanged(visibility);
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, visibility);
    }
}
