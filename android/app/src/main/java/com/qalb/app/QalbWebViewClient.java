package com.qalb.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Qalb — YouTube APP/SITE GUARD (v0.5.23)
 *
 * User rule: "YOUTUBE KISI HAAL ME ON NAHI HONA CHAHIYE — SARA VIDEO
 * HAMARE APP ME HI AANE CHAHIYE, KOI BHI 3RD APP OPEN NA HO."
 *
 * YT embed ke andar ke links (end-screen suggestions, "Watch on YouTube"
 * logo, window.open) main-frame navigation bana dete hain — Capacitor ka
 * default launchIntent us par ACTION_VIEW chala deta hai jisse YouTube
 * app khul jati thi. Ab:
 *   • youtube.com / youtu.be / vnd.youtube / YT-package intent — SAB
 *     main-frame navigations BLOCK (return true = load nahi hoga)
 *   • URL me videoId (v= ya /shorts/) ho to JS ko 'qalbYtLink' event —
 *     iTube watch screen usi video ko APNE player me chala deta hai
 *   • baaki sab URLs (OAuth, share, policy links) — super behaviour
 *
 * NOTE: sirf MAIN-FRAME block hota hai — YT embed iframe ka apna load
 * (youtube.com/embed/…) shouldOverrideUrlLoading se guzarta hi nahi,
 * aur tab bhi isForMainFrame() check double-safe hai.
 */
public class QalbWebViewClient extends BridgeWebViewClient {

    public QalbWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        try {
            Uri url = request.getUrl();
            if (url != null && request.isForMainFrame()) {
                String host = url.getHost() == null ? "" : url.getHost().toLowerCase();
                String s = url.toString();
                boolean ytHost =
                        host.equals("youtube.com") || host.endsWith(".youtube.com")
                                || host.equals("youtu.be") || host.endsWith(".youtu.be")
                                || host.equals("youtube-nocookie.com")
                                || host.endsWith(".youtube-nocookie.com");
                boolean ytIntent =
                        s.startsWith("vnd.youtube") || s.contains("com.google.android.youtube");
                if (ytHost || ytIntent) {
                    String vid = url.getQueryParameter("v");
                    if (vid == null || vid.isEmpty()) {
                        String path = url.getPath() == null ? "" : url.getPath();
                        if (path.startsWith("/shorts/") && path.length() > 8) {
                            vid = path.substring(8);
                        } else if (path.startsWith("/embed/") && path.length() > 7) {
                            vid = path.substring(7);
                        } else if (path.startsWith("/watch/")) {
                            vid = url.getLastPathSegment();
                        }
                        if (vid != null && vid.contains("/")) {
                            vid = vid.substring(0, vid.indexOf('/'));
                        }
                    }
                    String js;
                    if (vid != null && !vid.isEmpty()) {
                        String q = org.json.JSONObject.quote(vid);
                        js = "try{window.dispatchEvent(new CustomEvent('qalbYtLink',{detail:{videoId:"
                                + q + "}}))}catch(e){}";
                    } else {
                        js = "try{window.dispatchEvent(new CustomEvent('qalbYtLink',{}))}catch(e){}";
                    }
                    view.evaluateJavascript(js, null);
                    return true; // BLOCK — na browser, na YouTube app
                }
            }
        } catch (Exception ignored) {
            // guard fail ho to default behaviour (kabhi crash nahi)
        }
        return super.shouldOverrideUrlLoading(view, request);
    }
}
