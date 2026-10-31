package com.qalb.app;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Qalb — Loopback OAuth listener (v0.4.4)
 *
 * Google Cloud Console ab Web client ke liye custom scheme redirect URI
 * accept NAHI karta ("Invalid Redirect: must use http or https"). Google
 * ka official installed-app flow ab LOOPBACK IP hai:
 *
 *   1. JS startOauthServer() → app 127.0.0.1:PORT par chhota HTTP server
 *      bind karti hai (port busy ho to agla — max 20 try)
 *   2. Chrome authorize?...&redirect_uri=http://127.0.0.1:PORT/oauth2redirect
 *   3. Consent ke baad Google 302 → Chrome → GET /oauth2redirect?state&code
 *   4. Server query ko 'qalb://oauth2redirect?...' fake deep-link URL me
 *      wrap karke QalbNativePlugin.setPendingOauthUrl() + WebView JS event
 *      deta hai (MainActivity deep-link channel ka EXACT reuse)
 *   5. Response: success page + "Qalb kholo" intent link (wapas app me)
 *
 * Security:
 *  - sirf 127.0.0.1 par bind (LAN/network me kabhi expose nahi)
 *  - sirf GET, sirf /oauth2redirect path — query pass-through, koi
 *    storage/file access nahi
 *  - forged code token-exchange par Google ke yahan hi fail hota hai
 *    (upar se state CSRF check + PKCE verifier bhi hai)
 */
public final class QalbOauth {

    /** Redirect milne par JS tak pahunchane wala (plugin set karta hai) */
    public interface RedirectSink {
        void onRedirect(String fakeDeepLinkUrl);
    }

    private static volatile ServerSocket server;
    private static volatile int boundPort = -1;

    private QalbOauth() {
    }

    /**
     * preferred port se 20 ports tak try karke bind.
     *
     * @return bind hua port, ya -1 (sab busy)
     */
    public static synchronized int start(int preferredPort, RedirectSink sink) {
        stop(); // purana chal raha ho to pehle band
        for (int i = 0; i < 20; i++) {
            int port = preferredPort + i;
            try {
                ServerSocket ss = new ServerSocket(port, 8, InetAddress.getByName("127.0.0.1"));
                ss.setReuseAddress(true);
                server = ss;
                boundPort = port;
                Thread t = new Thread(() -> acceptLoop(sink), "qalb-oauth");
                t.setDaemon(true);
                t.start();
                return port;
            } catch (Exception ignored) {
                // port busy — agla try
            }
        }
        return -1;
    }

    public static synchronized void stop() {
        try {
            ServerSocket ss = server;
            server = null;
            boundPort = -1;
            if (ss != null && !ss.isClosed()) ss.close();
        } catch (Exception ignored) {
        }
    }

    public static synchronized int boundPort() {
        return boundPort;
    }

    private static void acceptLoop(RedirectSink sink) {
        while (true) {
            ServerSocket ss = server;
            if (ss == null || ss.isClosed()) return;
            try (Socket s = ss.accept()) {
                handleConn(s, sink);
            } catch (Exception e) {
                ServerSocket cur = server;
                if (cur == null || cur.isClosed()) return;
                // ek connection ka fail poora server nahi marta
            }
        }
    }

    private static void handleConn(Socket s, RedirectSink sink) {
        try {
            s.setSoTimeout(8000);
            BufferedReader in = new BufferedReader(
                    new InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
            String line = in.readLine(); // "GET /oauth2redirect?... HTTP/1.1"
            String target = null;
            if (line != null && line.startsWith("GET ")) {
                int sp = line.indexOf(' ', 4);
                if (sp > 4) target = line.substring(4, sp);
            }
            // headers ka ant (khali line) tak padho — GET me body nahi hota
            int guard = 0;
            String h;
            while (guard++ < 40 && (h = in.readLine()) != null && h.length() > 0) {
                // drain
            }

            if (target != null && target.startsWith("/oauth2redirect")) {
                String q = target.indexOf('?') >= 0 ? target.substring(target.indexOf('?')) : "";
                String fake = "qalb://oauth2redirect" + q;
                try {
                    if (sink != null) sink.onRedirect(fake);
                } catch (Exception ignored) {
                }
                respond(s, successHtml());
                return;
            }
            respond404(s);
        } catch (Exception ignored) {
        } finally {
            try {
                s.close();
            } catch (Exception ignored) {
            }
        }
    }

    private static void respond(Socket s, String html) {
        try {
            byte[] body = html.getBytes(StandardCharsets.UTF_8);
            OutputStream out = s.getOutputStream();
            String head = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: text/html; charset=utf-8\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(head.getBytes(StandardCharsets.US_ASCII));
            out.write(body);
            out.flush();
        } catch (Exception ignored) {
        }
    }

    private static void respond404(Socket s) {
        try {
            OutputStream out = s.getOutputStream();
            out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    .getBytes(StandardCharsets.US_ASCII));
            out.flush();
        } catch (Exception ignored) {
        }
    }

    /** Chrome me dikhne wala success page — 1.2s baad AUTO wapas app me */
    private static String successHtml() {
        return "<!doctype html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<title>Qalb — Login</title></head>"
                + "<body style='margin:0;font-family:sans-serif;background:#0B1F17;"
                + "color:#ECFDF5;display:flex;min-height:100vh;align-items:center;"
                + "justify-content:center;text-align:center'>"
                + "<div style='padding:32px'>"
                + "<div style='font-size:44px'>&#9989;</div>"
                + "<h1 style='font-size:20px;margin:12px 0 6px'>Login ho gaya!</h1>"
                + "<p style='font-size:14px;color:#A7F3D0;margin:0 0 24px'>Qalb khul raha hai...</p>"
                + "<a id='qb' href='intent://oauth2redirect#Intent;scheme=qalb;package=com.qalb.app;end'"
                + " style='display:inline-block;background:#10B981;color:#064E3B;font-weight:700;"
                + "padding:14px 28px;border-radius:14px;text-decoration:none;font-size:15px'>Qalb kholo</a>"
                // AUTO-return: 1.2s baad intent fire — tap ki zaroorat hi nahi.
                // (auto block ho jaye to button fallback hai)
                + "<script>setTimeout(function(){try{document.getElementById('qb').click()}"
                + "catch(e){}},1200)</script>"
                + "</div></body></html>";
    }
}
