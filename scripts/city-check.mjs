// Qalb — city-section removal check
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(2000)

// Profile tab pe jao (bottom nav)
const profileBtn = page.locator('[aria-label*="rofile"], [href*="profile"]').first()
if (await profileBtn.count()) await profileBtn.click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(1500)
const citySection = await page.locator('text=Namaz ke auqaat — shehar').count()
const ahmedabad = await page.locator('text=Ahmedabad').count()
console.log('profile-city-section:', citySection, '| ahmedabad-chip:', ahmedabad)
await page.screenshot({ path: 'scripts/city-1-profile.png' })

// Calendar tab
const calBtn = page.locator('[aria-label*="alendar"], [href*="calendar"]').first()
if (await calBtn.count()) await calBtn.click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(2500)
const pickerBtn = await page.locator('[aria-label="Shehar badlein"]').count()
const junagadhBadge = await page.locator('[aria-label="Namaz location: Junagadh"]').count()
console.log('calendar-picker-button:', pickerBtn, '| junagadh-static-badge:', junagadhBadge)
await page.screenshot({ path: 'scripts/city-2-calendar.png' })

console.log('page-errors:', errors.length ? errors.slice(0, 3) : 'none')
await browser.close()
