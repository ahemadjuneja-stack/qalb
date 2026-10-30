package com.qalb.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * Qalb — MainActivity
 *
 * BACK/SWIPE FIX (v0.2.2): Android back gesture ya button dabane par
 * default behaviour (app minimize/exit) ke bajaye hum JS ko "backButton"
 * event bhejte hain — JS apni view-stack ke hisaab se decide karta hai:
 *   full player modal khula? → band karo
 *   koi sheet khuli?         → band karo
 *   home se doosra tab?      → home par jao
 *   kuch nahi khula?         → JS ack karta hai, app home par rukti hai
 *   (v0.2.4: back se app KABHI minimize/exit nahi hoti — hamesha home tak)
 *
 * Fallback safety: agar WebView/JS dead hai (500ms me backHandled nahi
 * mila) to QalbNativePlugin khud moveTaskToBack karta hai — back hamesha
 * kuch na kuch karta hai, kabhi "dead" nahi hota.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Crash Guard SABSE PEHLE — WebView banne se pehle (wipe safe rehta hai)
        CrashGuard.install(this);
        // OTA web-bundle state machine (v0.3.0) — Bridge banne se PEHLE:
        // ready→active promote, broken bundle/APK-update par rollback.
        QalbOta.bootstrap(this);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(QalbNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Back gesture/button → JS-driven navigation (har screen par kaam kare)
        try {
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    try {
                        QalbNativePlugin.emitBackButton(MainActivity.this);
                    } catch (Exception e) {
                        // bridge fail → safe default: app background (na exit, na crash)
                        try {
                            moveTaskToBack(true);
                        } catch (Exception ignored) {
                        }
                    }
                }
            });
        } catch (Exception ignored) {
            // dispatcher na mile to default Android behaviour rehne do
        }
    }

    // ── App background/foreground events (v0.3.2) ────────────────────
    // Minimize par reel ka sound band karna hai (naat/qawwali player ko
    // background me chalne dete hain — wo foreground service hai). Android
    // WebView me document.hidden reliably fire NAHI hota, isliye hum
    // lifecycle se seedha JS ko window event bhejte hain — ReelsView isko
    // sunke active reel iframe pause/resume karta hai.
    @Override
    public void onPause() {
        super.onPause();
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "try{window.dispatchEvent(new CustomEvent('qalbAppBg',{detail:{bg:true}}))}catch(e){}",
                    null);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "try{window.dispatchEvent(new CustomEvent('qalbAppBg',{detail:{bg:false}}))}catch(e){}",
                    null);
            }
        } catch (Exception ignored) {
        }
    }
}
