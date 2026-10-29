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
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * Qalb — Playback Foreground Service
 *
 * Naat chalte waqt ye service foreground mode me chalti hai:
 *  - media notification dikhati hai (naat ka naam + Stop button)
 *  - PARTIAL_WAKE_LOCK hold karta hai taaki screen band hone par bhi
 *    CPU/WebView chalta rahe aur YouTube IFrame ka audio na ruke
 *  - Android Doze me process ko kill hone se bachata hai
 *
 * JS side (player-provider) se QalbNative plugin ke through start/stop hota hai.
 */
public class PlaybackService extends Service {

    public static final String CHANNEL_ID = "qalb_playback";
    public static final String CHANNEL_NAME = "Naat playback";
    public static final int NOTIFICATION_ID = 4711;

    public static final String ACTION_STOP = "com.qalb.app.action.STOP_PLAYBACK";
    public static final String ACTION_UPDATE = "com.qalb.app.action.UPDATE_META";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";

    private static final long WAKELOCK_TIMEOUT_MS = 8L * 60 * 60 * 1000; // 8h safety cap

    private PowerManager.WakeLock wakeLock;
    private String currentTitle;
    private String currentArtist;

    public static void start(Context ctx, String title, String artist) {
        Intent i = new Intent(ctx, PlaybackService.class);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_ARTIST, artist);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void updateMeta(Context ctx, String title, String artist) {
        Intent i = new Intent(ctx, PlaybackService.class);
        i.setAction(ACTION_UPDATE);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_ARTIST, artist);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, PlaybackService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            String t = intent.getStringExtra(EXTRA_TITLE);
            String a = intent.getStringExtra(EXTRA_ARTIST);
            if (t != null) currentTitle = t;
            if (a != null) currentArtist = a;
        }
        if (currentTitle == null) currentTitle = "Naat chal rahi hai";
        if (currentArtist == null) currentArtist = "Qalb";

        Notification notification = buildNotification(this, currentTitle, currentArtist);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        acquireWakeLock();
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
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

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

    private Notification buildNotification(Context ctx, String title, String artist) {
        Intent openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openPi = openIntent != null
                ? PendingIntent.getActivity(
                        this, 0, openIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : null;

        Intent stopIntent = new Intent(this, PlaybackService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
                this, 1, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist + " • Qalb")
                .setContentIntent(openPi)
                .addAction(android.R.drawable.ic_media_pause, "Band karein", stopPi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(NotificationCompat.CATEGORY_MEDIA)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private static void createChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Naat bajte waqt notification");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }
}
