package com.qalb.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
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

/**
 * Qalb — Playback Foreground Service (MediaSession + custom clustered bar)
 *
 * Naat chalte waqt ye service foreground mode me chalti hai:
 *  - CUSTOM RemoteViews bar (v0.5.19): bade buttons PAAS-PAAS ek cluster me
 *    [prev | play/pause | next] — user request. v0.5.17 custom bar gayab
 *    kyu hui thi? ROOT CAUSE MIL GAYA: v0.5.17 me builder se
 *    setContentTitle/setContentText hat gaye the — Android 13+ apps
 *    targeting T ko custom-view notification me standard content fields
 *    chahiye, bina unke system notification DROP kar deta hai. v0.2.2/
 *    v0.5.15 ka custom card render HOTA tha kyunki wahan title/text set
 *    the. Ab: custom views + title/text DONO (A13 header + extraction
 *    safe) — system MediaStyle NAHI (system media card buttons apne aap
 *    failta hai — spacing user-control nahi).
 *  - MediaSessionCompat: headset/Bluetooth buttons (token notification me
 *    NAHI — warna A11+ SystemUI custom views ko media card se replace
 *    kar deta) — sirf session API se controls.
 *  - Notification button presses → QalbNativePlugin.emitMediaAction() →
 *    WebView JS player store control
 *  - PARTIAL_WAKE_LOCK hold karta hai taaki screen band hone par bhi
 *    CPU/WebView chalta rahe aur YouTube IFrame ka audio na ruke
 *  - Playing me 1s interpolation ticker: seekbar position smooth aage badhta hai
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

    // ── Light sage theme palette (app ke light theme se) ─────────────
    private static final int SAGE_ACCENT = 0xFF0F9163;  // emerald accent
    private static final int ACCENT = SAGE_ACCENT;      // system chrome accent

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat session;

    private String currentTitle;
    private String currentArtist;
    private boolean playing;
    private double positionSec;
    private double durationSec;

    /** Position interpolation ticker (1s) — MediaSession position/seek sync chalta rahe */
    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (!playing) return;
                positionSec += 1.0;
                if (durationSec > 0 && positionSec > durationSec) positionSec = durationSec;
                updateSessionState();
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

        // v0.5.18 FIX — Android 13+ system media template buttons PlaybackState
        // se banata hai: session state PEHLE set karo, phir notification post
        // (pehli notification par play/pause button missing na rahe).
        updateSessionState();

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
        if (t != null) {
            currentTitle = t;
            found = true;
        }
        if (a != null) {
            currentArtist = a;
            found = true;
        }
        // EXTRA_THUMB ignore (v0.5.18) — thumbnail user ko nahi chahiye
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
            // v0.5.18 — ALBUM_ART nahi: user ko thumbnail nahi chahiye
            // (lock-screen card + shade dono me artwork na dikhe)
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

    // ── notification ─────────────────────────────────────────────────

    private PendingIntent actionPi(String action, int requestCode) {
        Intent i = baseIntent(this, action);
        return PendingIntent.getService(this, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification() {
        Intent openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openPi = openIntent != null
                ? PendingIntent.getActivity(
                        this, 0, openIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : null;

        // NOTE: API 36 me Notification.CATEGORY_MEDIA constant REMOVE ho chuka hai
        // (androidx NotificationCompat se bhi) — isliye category set nahi karte
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_qalb)
                .setContentTitle(currentTitle != null ? currentTitle : "Naat chal rahi hai")
                .setContentText((currentArtist != null ? currentArtist : "Qalb") + " • Qalb")
                .setContentIntent(openPi)
                .setDeleteIntent(actionPi(ACTION_STOP, 14)) // swipe-close = stop
                .setOngoing(playing) // pause me swipe-dismiss allowed
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setColor(SAGE_ACCENT) // system chrome bits sage accent me
                // ── v0.5.19 CUSTOM clustered bar — title/text UPAR SET HAIN
                // (A13 requirement — v0.5.17 inko hatane se notification drop
                // ho gayi thi). addActions/MediaStyle NAHI — decorated template
                // me system actions-row + hamara bar double ho jata.
                .setCustomContentView(buildControlsViews())  // collapsed = button bar
                .setCustomBigContentView(buildBigViews());   // expanded = bar + title

        return b.build();
    }

    /** Compact control bar: prev | play/pause | next cluster + close — bade buttons */
    private RemoteViews buildControlsViews() {
        RemoteViews rv = new RemoteViews(getPackageName(), R.layout.notification_controls);
        rv.setImageViewResource(R.id.notif_toggle,
                playing ? R.drawable.ic_notif_pause : R.drawable.ic_notif_play);
        rv.setOnClickPendingIntent(R.id.notif_prev, actionPi(ACTION_PREV, 11));
        rv.setOnClickPendingIntent(R.id.notif_toggle, actionPi(ACTION_TOGGLE, 12));
        rv.setOnClickPendingIntent(R.id.notif_next, actionPi(ACTION_NEXT, 13));
        rv.setOnClickPendingIntent(R.id.notif_close, actionPi(ACTION_STOP, 14));
        return rv;
    }

    /** Expanded view: bada cluster upar + title/artist neeche — thumbnail NAHI */
    private RemoteViews buildBigViews() {
        RemoteViews rv = new RemoteViews(getPackageName(), R.layout.notification_player);
        rv.setImageViewResource(R.id.notif_toggle,
                playing ? R.drawable.ic_notif_pause : R.drawable.ic_notif_play);
        rv.setOnClickPendingIntent(R.id.notif_prev, actionPi(ACTION_PREV, 11));
        rv.setOnClickPendingIntent(R.id.notif_toggle, actionPi(ACTION_TOGGLE, 12));
        rv.setOnClickPendingIntent(R.id.notif_next, actionPi(ACTION_NEXT, 13));
        rv.setOnClickPendingIntent(R.id.notif_close, actionPi(ACTION_STOP, 14));
        rv.setTextViewText(R.id.notif_title,
                currentTitle != null ? currentTitle : "Naat chal rahi hai");
        rv.setTextViewText(R.id.notif_artist,
                (currentArtist != null ? currentArtist : "Qalb") + " • Qalb");
        return rv;
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
