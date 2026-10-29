#!/usr/bin/env python3
# Qalb CI/CD — android/app/build.gradle me release signing config inject karta hai.
# key.properties (workflow me bana) se keystore load hota hai.
# Idempotent: jo pehle se hai wo skip karta hai, jo missing hai wo add karta hai.

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
    changed = False

    # 1) keystore properties load block — plugin line ke baad
    if "keystoreProperties" not in src:
        m = re.search(r"^apply plugin: 'com\.android\.application'.*$", src, re.M)
        if not m:
            print("[patch] com.android.application plugin line nahi mili", file=sys.stderr)
            return 1
        src = src[: m.end()] + "\n" + LOAD_BLOCK + src[m.end():]
        changed = True

    # 2) signingConfigs.release — android { block ke andar
    if "signingConfigs {" not in src:
        m = re.search(r"^android \{$", src, re.M)
        if not m:
            print("[patch] android { block nahi mila", file=sys.stderr)
            return 1
        src = src[: m.end()] + "\n" + SIGNING_CONFIG_BLOCK + src[m.end():]
        changed = True

    # 3) release buildType ko signingConfig release dena
    #    Capacitor 8 template me 'signingConfig signingConfigs.debug' line
    #    hoti hi nahi — isliye dono cases handle karo:
    if "signingConfig signingConfigs.release" not in src:
        if "signingConfig signingConfigs.debug" in src:
            # purana template: debug -> release replace
            src = src.replace(
                "signingConfig signingConfigs.debug",
                "signingConfig signingConfigs.release",
            )
        else:
            # naya template: release { ke andar khud insert karo
            src, n = re.subn(
                r"(buildTypes \{\s*\n\s*release \{)",
                r"\1\n            signingConfig signingConfigs.release",
                src,
                count=1,
            )
            if n == 0:
                print("[patch] buildTypes.release block nahi mila", file=sys.stderr)
                return 1
        changed = True

    if changed:
        GRADLE.write_text(src)
        print("[patch] release signing config inject ho gaya")
    else:
        print("[patch] signing config pehle se maujood hai — skip")
    return 0


if __name__ == "__main__":
    sys.exit(main())
