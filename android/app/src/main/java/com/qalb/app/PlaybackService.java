package com.qalb.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Qalb — Playback Foreground Service (MediaSession + custom sage notification)
 *
 * Naat chalte waqt ye service foreground mode me chalti hai:
 *  - MediaSessionCompat: lock screen + headset buttons par standard media controls
 *  - CUSTOM notification (v0.2.2): light sage theme card — app jaisa look:
 *      • sage ivory background (#EEF3E8) + deep emerald ink text
 *      • HEARTBEAT seek line — 3-frame ViewFlipper upar-niche-upar-niche bounce
 *        (auto-cycle hota hai, har frame ke liye re-notify NAHI karna padta)
 *      • Close (×) button — tap = song stop + notification band, app NAHI khulti
 *  - Notification button presses → QalbNativePlugin.emitMediaAction() →
 *    WebView JS player store control
 *  - PARTIAL_WAKE_LOCK hold karta hai taaki screen band hone par bhi
 *    CPU/WebView chalta rahe aur YouTube IFrame ka audio na ruke
 *  - Playing me 1s interpolation ticker: seek line + times smooth aage badhte
 *
 * JS side (player-provider) se QalbNative plugin ke through start/update/stop.
 *
 * CRASH-SAFETY (v0.2.1-24 pattern): har path try/catch me — kisi bhi OEM ROM
 * ka media/notification quirk app ko crash nahi kar sakta.
 */
public class PlaybackService extends Service {

    public static final String CHANNEL_ID = "qalb_playback";
    public static final String CHANNEL_NAME = "Naat playback";
    public static final int NOTIFICATION_ID = 4711;

    public static final String ACTION_STOP = "com.qalb.app.action.STOP_PLAYBACK";
    public static final String ACTION_UPDATE = "com.qalb.app.action.UPDATE_META";
    public static final String ACTION_TOGGLE = "com.qalb.app.action.TOGGLE";
    public static final String ACTION_NEXT = "com.qalb.app.action.NEXT";
    public static final String ACTION_PREV = "com.qalb.app.action.PREV";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_THUMB = "thumbUrl";
    public static final String EXTRA_PLAYING = "isPlaying";
    public static final String EXTRA_POSITION = "position";
    public static final String EXTRA_DURATION = "duration";

    private static final long WAKELOCK_TIMEOUT_MS = 8L * 60 * 60 * 1000; // 8h safety cap
    private static final int ART_SIZE = 256;

    // ── Light sage theme palette (app ke light theme se) ─────────────
    private static final int SAGE_BG = 0xFFEEF3E8;      // ivory-sage card bg
    private static final int SAGE_INK = 0xFF1C2F24;     // deep emerald ink
    private static final int SAGE_MUTED = 0xFF5A6E61;   // muted sage text
    private static final int SAGE_ACCENT = 0xFF0F9163;  // emerald accent
    private static final int SAGE_TRACK = 0xFFD7E3D2;   // seek track (halka sage)
    private static final int ACCENT = SAGE_ACCENT;      // system chrome accent

    // ── Seek bitmap geometry (ECG heartbeat waveform) ──────────────
    // Bitmap fitXY se notification width par stretch hota hai — ECG waveform
    // uniform repeat hota hai isliye stretch me distortion nahi.
    private static final int SEEK_W = 600;
    private static final int SEEK_H = 64;
    private static final float SEEK_OFFSET_PX = 8f;     // bounce amplitude (~3dp)
    private static final int SEEK_PULSES = 5;           // itne heartbeats poori line me

    private final ExecutorService thumbExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    /** Thumbnail cache (URL → downloaded bitmap) — thread-safe */
    private static final Map<String, Bitmap> THUMB_CACHE = new ConcurrentHashMap<>();

    private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat session;

    private String currentTitle;
    private String currentArtist;
    private String currentThumb;
    private boolean playing;
    private double positionSec;
    private double durationSec;
    private Bitmap artwork;

    /** Position interpolation ticker (1s) — seek line + times chalte rahe */
    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (!playing) return;
                positionSec += 1.0;
                if (durationSec > 0 && positionSec > durationSec) positionSec = durationSec;
                updateSessionState();
                pushNotification();
            } catch (Exception ignored) {
            } finally {
                if (playing) {
                    mainHandler.postDelayed(this, 1000L);
                }
            }
        }
    };

    // ── static entry points (QalbNativePlugin se) ────────────────────

    public static void start(Context ctx, String title, String artist, String thumbUrl) {
        launch(ctx, baseIntent(ctx, ACTION_UPDATE)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_ARTIST, artist)
                .putExtra(EXTRA_THUMB, thumbUrl)
                .putExtra(EXTRA_PLAYING, true));
    }

    public static void updateMeta(Context ctx, String title, String artist, String thumbUrl,
                                  boolean isPlaying, double position, double duration) {
        launch(ctx, baseIntent(ctx, ACTION_UPDATE)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_ARTIST, artist)
                .putExtra(EXTRA_THUMB, thumbUrl)
                .putExtra(EXTRA_PLAYING, isPlaying)
                .putExtra(EXTRA_POSITION, position)
                .putExtra(EXTRA_DURATION, duration));
    }

    public static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, PlaybackService.class));
        } catch (Exception ignored) {
        }
    }

    private static Intent baseIntent(Context ctx, String action) {
        return new Intent(ctx, PlaybackService.class).setAction(action);
    }

    private static void launch(Context ctx, Intent i) {
        // CRASH-SAFETY: Android 12+ background se startForegroundService allowed
        // nahi hai (track auto-advance jab app background me ho) — exception
        // catch karo, audio WebView me chalta rahega, sirf notification nahi banegi.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(i);
            } else {
                ctx.startService(i);
            }
        } catch (Exception ignored) {
            // background FGS start restriction — non-fatal
        }
    }

    // ── lifecycle ────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel(this);
        setupSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            // × button (ya JS stop) — song band, notification hatao, app NA kholo
            emitMediaAction("stop"); // JS: isPlaying=false → YT pause + service stop
            releaseWakeLock();
            stopSelf();
            return START_NOT_STICKY;
        }

        boolean hadMeta = applyIntent(intent);
        if (!hadMeta) {
            if (currentTitle == null) currentTitle = "Naat chal rahi hai";
            if (currentArtist == null) currentArtist = "Qalb";
        }

        Notification notification = buildNotification();
        // CRASH-SAFETY: startForeground fail ho (OEM permission/type quirks) to
        // service khud band — warna system "did not call startForeground" ANR crash
        // deta hai. Audio WebView me phir bhi chalega.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }

        updateSessionState();

        if (playing) {
            acquireWakeLock();
            startTicker();
        } else {
            releaseWakeLock();
            stopTicker();
        }

        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App recents se swiped → playback band + notification hatao
        releaseWakeLock();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        stopTicker();
        releaseWakeLock();
        if (session != null) {
            try {
                session.setActive(false);
                session.release();
            } catch (Exception ignored) {
            }
            session = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── position interpolation ticker ────────────────────────────────

    private void startTicker() {
        mainHandler.removeCallbacks(tickRunnable);
        mainHandler.postDelayed(tickRunnable, 1000L);
    }

    private void stopTicker() {
        mainHandler.removeCallbacks(tickRunnable);
    }

    // ── intent → state ───────────────────────────────────────────────

    /** @return true agar intent me koi metadata field mila */
    private boolean applyIntent(Intent intent) {
        if (intent == null) return false;

        String action = intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            emitMediaAction(playing ? "pause" : "play");
            return false;
        }
        if (ACTION_NEXT.equals(action)) {
            emitMediaAction("next");
            return false;
        }
        if (ACTION_PREV.equals(action)) {
            emitMediaAction("prev");
            return false;
        }

        boolean found = false;
        String t = intent.getStringExtra(EXTRA_TITLE);
        String a = intent.getStringExtra(EXTRA_ARTIST);
        String th = intent.getStringExtra(EXTRA_THUMB);
        if (t != null) {
            currentTitle = t;
            found = true;
        }
        if (a != null) {
            currentArtist = a;
            found = true;
        }
        if (th != null && !th.isEmpty() && !th.equals(currentThumb)) {
            currentThumb = th;
            found = true;
            Bitmap cached = THUMB_CACHE.get(th);
            if (cached != null) {
                artwork = cached;
            } else {
                artwork = null;
                fetchThumb(th);
            }
        }
        if (intent.hasExtra(EXTRA_PLAYING)) {
            playing = intent.getBooleanExtra(EXTRA_PLAYING, playing);
            found = true;
        }
        if (intent.hasExtra(EXTRA_POSITION)) {
            positionSec = intent.getDoubleExtra(EXTRA_POSITION, positionSec);
            found = true;
        }
        if (intent.hasExtra(EXTRA_DURATION)) {
            durationSec = intent.getDoubleExtra(EXTRA_DURATION, durationSec);
            found = true;
        }
        return found;
    }

    // ── MediaSession ─────────────────────────────────────────────────

    private void setupSession() {
        try {
            session = new MediaSessionCompat(this, "QalbPlayback");
            session.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    emitMediaAction("play");
                }

                @Override
                public void onPause() {
                    emitMediaAction("pause");
                }

                @Override
                public void onSkipToNext() {
                    emitMediaAction("next");
                }

                @Override
                public void onSkipToPrevious() {
                    emitMediaAction("prev");
                }

                @Override
                public void onStop() {
                    emitMediaAction("stop");
                }

                @Override
                public void onSeekTo(long pos) {
                    emitMediaAction("seek:" + (pos / 1000.0));
                }
            });
            session.setActive(true);
        } catch (Exception e) {
            // session fail = sirf lock-screen controls nahi milenge — app theek
            session = null;
        }
    }

    private void updateSessionState() {
        if (session == null) return;
        try {
            MediaMetadataCompat.Builder mb = new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Qalb — Naat & Sufi Kalam")
                    .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (long) (durationSec * 1000));
            if (artwork != null) {
                mb.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
            }
            session.setMetadata(mb.build());

            long actions = PlaybackStateCompat.ACTION_PLAY
                    | PlaybackStateCompat.ACTION_PAUSE
                    | PlaybackStateCompat.ACTION_PLAY_PAUSE
                    | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                    | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackStateCompat.ACTION_SEEK_TO
                    | PlaybackStateCompat.ACTION_STOP;
            float speed = playing ? 1f : 0f;
            PlaybackStateCompat ps = new PlaybackStateCompat.Builder()
                    .setActions(actions)
                    .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                            (long) (positionSec * 1000), speed)
                    .build();
            session.setPlaybackState(ps);
        } catch (Exception ignored) {
        }
    }

    /** JS (WebView) ko media button action bhejo */
    private void emitMediaAction(String action) {
        try {
            QalbNativePlugin.emitMediaAction(action);
        } catch (Exception ignored) {
        }
    }

    // ── thumbnail download ───────────────────────────────────────────

    private void fetchThumb(final String url) {
        thumbExecutor.execute(() -> {
            Bitmap bmp = downloadBitmap(url);
            if (bmp != null) {
                if (THUMB_CACHE.size() > 12) THUMB_CACHE.clear(); // small safety cap
                THUMB_CACHE.put(url, bmp);
                artwork = bmp;
                mainHandler.post(() -> {
                    updateSessionState();
                    pushNotification();
                });
            }
        });
    }

    private Bitmap downloadBitmap(String urlStr) {
        HttpURLConnection conn = null;
        InputStream in = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setInstanceFollowRedirects(true);
            in = conn.getInputStream();
            Bitmap raw = BitmapFactory.decodeStream(in);
            if (raw == null) return null;
            return centerCropSquare(raw, ART_SIZE);
        } catch (Exception e) {
            return null;
        } finally {
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {
            }
            if (conn != null) try {
                conn.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    /** YouTube letterbox bars hata kar clean square art banao */
    private static Bitmap centerCropSquare(Bitmap src, int size) {
        try {
            int w = src.getWidth();
            int h = src.getHeight();
            int side = Math.min(w, h);
            int x = (w - side) / 2;
            int y = (h - side) / 2;
            Bitmap square = Bitmap.createBitmap(src, x, y, side, side);
            if (square.getWidth() != size) {
                square = Bitmap.createScaledBitmap(square, size, size, true);
            }
            return square;
        } catch (Exception e) {
            return src;
        }
    }

    /** Network thumb na mile to sage crescent fallback art */
    private static Bitmap fallbackArt() {
        try {
            Bitmap bmp = Bitmap.createBitmap(ART_SIZE, ART_SIZE, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            c.drawColor(SAGE_ACCENT); // sage-emerald
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setColor(SAGE_BG);
            int cx = ART_SIZE / 2;
            int cy = ART_SIZE / 2;
            int r = ART_SIZE / 3;
            c.drawCircle(cx, cy, r, p);
            // crescent cut
            p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.CLEAR));
            c.drawCircle(cx + (int) (r * 0.42), cy - (int) (r * 0.18), (int) (r * 0.84), p);
            p.setXfermode(null);
            p.setColor(0xFFFFFFFF);
            // chhota star
            c.drawCircle(cx + (int) (r * 0.95), cy - (int) (r * 0.25), ART_SIZE / 26f, p);
            return bmp;
        } catch (Exception e) {
            return null;
        }
    }

    // ── seek bitmaps (ECG heartbeat waveform frames) ─────────────────

    /**
     * ECG/EKG heartbeat waveform path — image reference jaisi:
     * flat → P bump (chhota upar) → Q dip → R spike (lamba upar) →
     * S dip (neeche) → recover → T wave → flat … repeat
     */
    private static Path buildEcgPath() {
        Path p = new Path();
        float baseY = SEEK_H / 2f;
        float pw = SEEK_W / (float) SEEK_PULSES;
        p.moveTo(0, baseY);
        for (int i = 0; i < SEEK_PULSES; i++) {
            float x0 = i * pw;
            p.lineTo(x0 + 0.14f * pw, baseY);                       // flat
            p.quadTo(x0 + 0.19f * pw, baseY - 10f,                  // P wave bump
                    x0 + 0.24f * pw, baseY);
            p.lineTo(x0 + 0.36f * pw, baseY);                       // flat
            p.lineTo(x0 + 0.40f * pw, baseY + 8f);                  // Q dip
            p.lineTo(x0 + 0.46f * pw, baseY - 30f);                 // R spike (lamba upar)
            p.lineTo(x0 + 0.51f * pw, baseY + 16f);                 // S dip (neeche)
            p.lineTo(x0 + 0.55f * pw, baseY);                       // recover
            p.lineTo(x0 + 0.63f * pw, baseY);                       // flat
            p.quadTo(x0 + 0.68f * pw, baseY - 12f,                  // T wave
                    x0 + 0.73f * pw, baseY);
            p.lineTo(x0 + pw, baseY);                               // pulse end
        }
        return p;
    }

    /**
     * Ek ECG seek frame render karo. yOffset = waveform ka vertical bounce
     * (heartbeat: -amp / 0 / +amp). Track sage, traveled hissa emerald glow
     * ke sath — player ke ECG seekbar jaisa look.
     */
    private static Bitmap renderSeekFrame(float progress, float yOffset) {
        try {
            Bitmap bmp = Bitmap.createBitmap(SEEK_W, SEEK_H, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);

            Path ecg = buildEcgPath();
            c.save();
            c.translate(0, yOffset);

            // track — poori ECG line halki sage me
            p.setColor(SAGE_TRACK);
            p.setStrokeWidth(SEEK_H * 0.09f);
            c.drawPath(ecg, p);

            // progress — traveled hissa bright emerald + glow
            float prog = Math.max(0f, Math.min(1f, progress));
            if (prog > 0f) {
                float endX = SEEK_W * prog;
                c.save();
                c.clipRect(0f, -SEEK_H, endX, SEEK_H * 2f);
                // glow pass (wide, semi-transparent)
                p.setColor(SAGE_ACCENT);
                p.setAlpha(80);
                p.setStrokeWidth(SEEK_H * 0.24f);
                c.drawPath(ecg, p);
                // main line
                p.setAlpha(255);
                p.setStrokeWidth(SEEK_H * 0.10f);
                c.drawPath(ecg, p);
                c.restore();
            }
            c.restore();
            return bmp;
        } catch (Exception e) {
            return null;
        }
    }

    /** Thumbnail ko rounded-corner card me convert karo (sage card ke sath match) */
    private static Bitmap roundedThumb(Bitmap src) {
        if (src == null) return null;
        try {
            int size = Math.min(src.getWidth(), src.getHeight());
            int out = ART_SIZE;
            Bitmap outBmp = Bitmap.createBitmap(out, out, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(outBmp);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            // sage gap ring — card se thumb ke beech halki border
            c.drawColor(SAGE_BG);
            float radius = out * 0.18f;
            RectF rect = new RectF(out * 0.02f, out * 0.02f, out * 0.98f, out * 0.98f);
            // scaled square crop
            Bitmap square = centerCropSquare(src, out);
            android.graphics.Path clip = new android.graphics.Path();
            clip.addRoundRect(rect, radius, radius, android.graphics.Path.Direction.CW);
            c.save();
            c.clipPath(clip);
            c.drawBitmap(square, null, rect, p);
            c.restore();
            return outBmp;
        } catch (Exception e) {
            return src;
        }
    }

    private static String fmtTime(double sec) {
        try {
            if (sec < 0 || Double.isNaN(sec) || Double.isInfinite(sec)) sec = 0;
            long s = (long) sec;
            long m = s / 60;
            s = s % 60;
            return m + ":" + String.format("%02d", s);
        } catch (Exception e) {
            return "0:00";
        }
    }

    // ── notification ─────────────────────────────────────────────────

    private void pushNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
        } catch (Exception ignored) {
        }
    }

    private PendingIntent actionPi(String action, int requestCode) {
        Intent i = baseIntent(this, action);
        return PendingIntent.getService(this, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Custom sage notification views banao (theme match + heartbeat + close) */
    private RemoteViews buildRemoteViews() {
        RemoteViews rv = new RemoteViews(getPackageName(), R.layout.notification_player);

        // text + thumb
        rv.setTextViewText(R.id.notif_title, currentTitle != null ? currentTitle : "Naat chal rahi hai");
        rv.setTextViewText(R.id.notif_artist,
                (currentArtist != null ? currentArtist : "Qalb") + " • Qalb");
        rv.setTextViewText(R.id.notif_pos, fmtTime(positionSec));
        rv.setTextViewText(R.id.notif_dur, fmtTime(durationSec));

        try {
            Bitmap large = artwork != null ? artwork : fallbackArt();
            Bitmap rounded = roundedThumb(large);
            if (rounded != null) rv.setImageViewBitmap(R.id.notif_thumb, rounded);
        } catch (Exception ignored) {
        }

        // heartbeat seek frames: upar / center / niche — ViewFlipper 140ms cycle
        float prog = durationSec > 0 ? (float) (positionSec / durationSec) : 0f;
        Bitmap fA = renderSeekFrame(prog, -SEEK_OFFSET_PX);
        Bitmap fB = renderSeekFrame(prog, 0f);
        Bitmap fC = renderSeekFrame(prog, SEEK_OFFSET_PX);
        if (fA != null) rv.setImageViewBitmap(R.id.notif_seek_a, fA);
        if (fB != null) rv.setImageViewBitmap(R.id.notif_seek_b, fB);
        if (fC != null) rv.setImageViewBitmap(R.id.notif_seek_c, fC);
        if (fB != null) rv.setImageViewBitmap(R.id.notif_seek_static, fB);

        // playing → flipper bounce; paused → static line
        rv.setViewVisibility(R.id.notif_flip,
                playing ? android.view.View.VISIBLE : android.view.View.GONE);
        rv.setViewVisibility(R.id.notif_seek_static,
                playing ? android.view.View.GONE : android.view.View.VISIBLE);

        // toggle icon
        rv.setImageViewResource(R.id.notif_toggle, playing ? R.drawable.ic_notif_pause : R.drawable.ic_notif_play);

        // clicks
        rv.setOnClickPendingIntent(R.id.notif_prev, actionPi(ACTION_PREV, 11));
        rv.setOnClickPendingIntent(R.id.notif_toggle, actionPi(ACTION_TOGGLE, 12));
        rv.setOnClickPendingIntent(R.id.notif_next, actionPi(ACTION_NEXT, 13));
        rv.setOnClickPendingIntent(R.id.notif_close, actionPi(ACTION_STOP, 14));

        return rv;
    }

    private Notification buildNotification() {
        Intent openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openPi = openIntent != null
                ? PendingIntent.getActivity(
                        this, 0, openIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : null;

        RemoteViews views = buildRemoteViews();

        // NOTE: API 36 me Notification.CATEGORY_MEDIA constant REMOVE ho chuka hai
        // (androidx NotificationCompat se bhi) — isliye category set nahi karte
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_qalb)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist != null ? currentArtist + " • Qalb" : "Qalb")
                .setContentIntent(openPi)
                .setCustomContentView(views)
                .setCustomBigContentView(views)
                .setOngoing(playing) // pause me swipe-dismiss allowed
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setColor(SAGE_ACCENT); // system chrome bits sage accent me

        return b.build();
    }

    // ── wake lock ────────────────────────────────────────────────────

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "qalb:playback");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private static void createChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Naat bajte waqt media controls");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }
}
