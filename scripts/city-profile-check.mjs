// Qalb — profile tab city removal check
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(2000)
// Profile nav — text match
await page.getByText('Profile', { exact: true }).last().click({ timeout: 5000 }).catch(() => console.log('click-fail'))
await page.waitForTimeout(1500)
const citySection = await page.locator('text=Namaz ke auqaat').count()
const ahmedabad = await page.locator('text=Ahmedabad').count()
const updateCard = await page.locator('text=0.2.1').count()
console.log('profile-city-section:', citySection, '| ahmedabad:', ahmedabad, '| version-card:', updateCard)
await page.screenshot({ path: 'scripts/city-1-profile.png' })
await browser.close()
