// Qalb — heartbeat mini-player visual check
import { chromium } from 'playwright'

const url = 'http://localhost:3000'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(2500)
await page.screenshot({ path: 'scripts/hb-1-home.png' })

// pehla track click (trending / any play button)
const playBtn = page.locator('[aria-label*="chala"], [aria-label*="Play"], [aria-label*="play"]').first()
if (await playBtn.count()) {
  await playBtn.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(3500)
}
await page.screenshot({ path: 'scripts/hb-2-player.png' })

// mini-player visible? progress hairline classes?
const mini = await page.locator('.qalb-ph-line, [class*="qalb-ph"]').count()
console.log('ph-elements:', mini)

// full player modal open
const openFull = page.locator('[aria-label="Full player kholein"]').first()
if (await openFull.count()) {
  await openFull.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'scripts/hb-3-full.png' })
  const sliderBeat = await page.locator('.qalb-heartbeat-slider').count()
  console.log('slider-heartbeat-class:', sliderBeat)
}

console.log('page-errors:', errors.length ? errors.slice(0, 5) : 'none')
await browser.close()
