#!/usr/bin/env python3
# Qalb CI/CD — android/app/build.gradle me release signing config inject karta hai.
# key.properties (workflow me bana) se keystore load hota hai.
# Idempotent: agar pehle se patch hai to kuch nahi karta.

import re
import sys
from pathlib import Path

GRADLE = Path("android/app/build.gradle")

LOAD_BLOCK = """
// ── Qalb CI/CD signing (auto-injected — patch-android-signing.py) ──
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
"""

SIGNING_CONFIG_BLOCK = """
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
"""


def main() -> int:
    if not GRADLE.exists():
        print(f"[patch] {GRADLE} nahi mila — cap add android pehle chalana", file=sys.stderr)
        return 1

    src = GRADLE.read_text()
    if "key.properties" in src and "signingConfigs.release" in src:
        print("[patch] signing config pehle se maujood hai — skip")
        return 0

    # 1) keystore properties load block — plugin line ke baad
    m = re.search(r"^apply plugin: 'com\.android\.application'.*$", src, re.M)
    if not m:
        print("[patch] com.android.application plugin line nahi mili", file=sys.stderr)
        return 1
    if "keystoreProperties" not in src:
        src = src[: m.end()] + "\n" + LOAD_BLOCK + src[m.end():]

    # 2) signingConfigs.release — android { block ke andar
    m = re.search(r"^android \{$", src, re.M)
    if not m:
        print("[patch] android { block nahi mila", file=sys.stderr)
        return 1
    if "signingConfigs {" not in src:
        src = src[: m.end()] + "\n" + SIGNING_CONFIG_BLOCK + src[m.end():]

    # 3) release buildType → signingConfig release
    src = src.replace(
        "signingConfig signingConfigs.debug",
        "signingConfig signingConfigs.release",
    )

    GRADLE.write_text(src)
    print("[patch] release signing config inject ho gaya")
    return 0


if __name__ == "__main__":
    sys.exit(main())
