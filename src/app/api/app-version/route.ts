// Qalb — GET /api/app-version
// Firestore appVersions collection ka local mirror — CI/CD pipeline yahan
// har release ke baad latest versionCode/versionName/apkUrl publish karti hai.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const latest = await db.appVersion.findFirst({
      orderBy: { versionCode: 'desc' },
    })
    if (!latest) {
      return NextResponse.json({ error: 'No release published yet' }, { status: 404 })
    }
    return NextResponse.json({
      versionCode: latest.versionCode,
      versionName: latest.versionName,
      apkUrl: latest.apkUrl,
      releaseNotes: latest.releaseNotes,
      mandatory: latest.mandatory,
      publishedAt: latest.publishedAt.toISOString(),
    })
  } catch (e) {
    console.error('[api/app-version] error:', e)
    return NextResponse.json({ error: 'Version check failed' }, { status: 500 })
  }
}
