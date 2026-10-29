package com.qalb.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Crash Guard SABSE PEHLE — WebView banne se pehle (wipe safe rehta hai)
        CrashGuard.install(this);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(QalbNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
