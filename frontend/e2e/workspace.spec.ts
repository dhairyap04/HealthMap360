import { test, expect } from '@playwright/test'
import path from 'node:path'

test('complete public health workspace workflow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Tile delivery is external; the application and markers work without the base tiles.
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No observations in this view' })).toBeVisible()
  await page.getByRole('link', { name: 'Reports & data' }).click()
  await page
    .getByLabel('Upload outbreak CSV')
    .setInputFiles(path.resolve('public/sample-outbreaks.csv'))
  await expect(
    page.getByText('8 / 8 valid records in the full file.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Import 8 records' }).click()
  await expect(page.locator('.success')).toContainText('8 records saved')
  await page.reload()
  await expect(page.getByRole('cell', { name: 'Edmonton', exact: true }).first()).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export filtered CSV' }).click()
  expect((await download).suggestedFilename()).toBe('healthmap360-cases.csv')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(
    page.locator('.stat').filter({ hasText: 'Reported cases' }).locator('strong'),
  ).toHaveText('93')
  await page.getByRole('combobox', { name: 'Disease', exact: true }).click()
  await page.getByRole('option', { name: 'covid-19', exact: true }).click()
  await expect(
    page.locator('.stat').filter({ hasText: 'Reported cases' }).locator('strong'),
  ).toHaveText('11')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(
    page.locator('.stat').filter({ hasText: 'Reported cases' }).locator('strong'),
  ).toHaveText('93')
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Outbreak map' }).click()
  await expect(page.getByRole('heading', { name: '3 affected locations' })).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(3)
  await page.getByRole('link', { name: 'Resources', exact: true }).click()
  await page.getByRole('button', { name: 'Add resource' }).click()
  await page.getByLabel('Resource type').fill('Protective masks')
  await page.getByLabel('Quantity', { exact: true }).fill('250')
  await page
    .getByRole('combobox', { name: 'Assigned location', exact: true })
    .selectOption({ label: 'Edmonton' })
  await page.getByLabel('Allocation date').fill('2026-11-07')
  await page.getByRole('button', { name: 'Save resource' }).click()
  await expect(page.getByRole('cell', { name: 'Protective masks', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit / allocate' }).click()
  await page.getByLabel('Quantity', { exact: true }).fill('200')
  await page.getByRole('button', { name: 'Save resource' }).click()
  await expect(page.getByRole('cell', { name: '200', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Add location' }).click()
  await page.route('**/api/locations/search?*', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            id: 'relation:456',
            name: 'Lethbridge, Alberta, Canada',
            label: 'Lethbridge, Alberta, Canada',
            latitude: 49.7,
            longitude: -112.8,
            administrative_level: 'city',
            country: 'Canada',
            region: 'Alberta',
          },
        ],
      },
    }),
  )
  await page.getByLabel('Search for a place', { exact: true }).fill('Lethbridge, Canada')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: /Lethbridge, Alberta, Canada/ }).click()
  await page.getByLabel('Display name', { exact: true }).fill('Lethbridge')
  await page.getByRole('button', { name: 'Save location' }).click()
  await expect(page.getByRole('cell', { name: 'Lethbridge', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Reports & data' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  await page.getByLabel('Daily case count').fill('5')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.success')).toHaveText('Observation updated.')
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await page.getByRole('button', { name: 'Delete observation', exact: true }).click()
  await expect(page.locator('.success')).toHaveText('Observation deleted.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Username', { exact: true }).fill('public_browser')
  await page.getByLabel('Email', { exact: true }).fill('public@example.com')
  await page.getByLabel('Password', { exact: true }).fill('public-test-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('Read access', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Reports & data' }).click()
  await expect(page.getByRole('heading', { name: 'Import outbreak data' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Role for public_browser' }).selectOption('analyst')
  await expect(page.locator('.success')).toContainText('Access updated')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill('public_browser')
  await page.getByLabel('Password', { exact: true }).fill('public-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Reports & data' }).click()
  await expect(page.getByRole('heading', { name: 'Import outbreak data' })).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Current password', { exact: true }).fill('public-test-password')
  await page.getByLabel('New password', { exact: true }).fill('changed-test-password')
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByLabel('Username', { exact: true }).fill('public_browser')
  await page.getByLabel('Password', { exact: true }).fill('changed-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  expect(errors).toEqual([])
})

test('invalid records beyond the preview are actionable and replacement resets the import', async ({
  page,
}) => {
  await page.goto('/#/reports')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const header = 'date,location,disease,case_count,severity,latitude,longitude'
  const rows = Array.from({ length: 101 }, (_, i) => `2026-11-01,Test ${i},flu,1,low,0,0`)
  const content = [header, ...rows, '2026-99-99,Invalid,flu,1,low,0,0'].join('\n')
  await page
    .getByLabel('Upload outbreak CSV')
    .setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from(content) })
  await expect(page.getByText('Row 103: date:', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import 102 records' })).toBeDisabled()
  await page.getByLabel('Upload outbreak CSV').setInputFiles({
    name: 'replacement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('day,city,illness,count,level\n2026-11-01,Edmonton,flu,1,low'),
  })
  await expect(page.locator('.mapping-grid select').first()).toHaveValue('day')
  await expect(page.getByRole('button', { name: 'Import 1 records' })).toBeEnabled()
  await expect(page.getByText('Row 103: date:', { exact: false })).toHaveCount(0)
  await page
    .getByLabel('Upload outbreak CSV')
    .setInputFiles({ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('not a csv') })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Import \d/ })).toHaveCount(0)
})

test('styled filters support keyboard use and place search requires an explicit selection', async ({
  page,
}) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const severity = page.getByRole('combobox', { name: 'Severity', exact: true })
  await severity.click()
  await page.screenshot({ path: 'test-results/filter-menu-desktop.png', fullPage: false })
  await page.keyboard.press('Home')
  await expect(page.getByRole('option', { name: 'All severities', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'Low', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(severity).toHaveText('Low')
  await expect(
    page.locator('.stat').filter({ hasText: 'Reported cases' }).locator('strong'),
  ).toHaveText('13')
  await severity.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(severity).toBeFocused()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(severity).toHaveText('All severities')
  await page.setViewportSize({ width: 390, height: 844 })
  await severity.click()
  await expect(page.getByRole('option', { name: 'Critical', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/filter-menu-mobile.png', fullPage: false })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Add location' }).click()
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveCount(0)
  const save = page.getByRole('button', { name: 'Save location', exact: true })
  await expect(save).toBeDisabled()
  let searches = 0
  await page.route('**/api/locations/search?*', (route) => {
    searches += 1
    if (searches === 1) return route.fulfill({ json: { results: [] } })
    if (searches === 2)
      return route.fulfill({
        status: 503,
        json: { detail: 'Place search is temporarily unavailable. Please try again.' },
      })
    return route.fulfill({
      json: {
        results: [
          {
            id: 'relation:111',
            name: 'Springfield, Illinois, United States',
            label: 'Springfield, Sangamon County, Illinois, United States',
            latitude: 39.7817,
            longitude: -89.6501,
            administrative_level: 'city',
            country: 'United States',
            region: 'Illinois',
          },
          {
            id: 'relation:222',
            name: 'Springfield, Massachusetts, United States',
            label: 'Springfield, Hampden County, Massachusetts, United States',
            latitude: 42.1015,
            longitude: -72.5898,
            administrative_level: 'city',
            country: 'United States',
            region: 'Massachusetts',
          },
        ],
      },
    })
  })
  const input = page.getByLabel('Search for a place', { exact: true })
  await input.fill('Springfield')
  expect(searches).toBe(0)
  await input.press('Enter')
  await expect(page.getByText('No matching places found')).toBeVisible()
  await expect(save).toBeDisabled()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: /Springfield, Illinois/ })).toBeVisible()
  await expect(save).toBeDisabled()
  await page.screenshot({ path: 'test-results/location-search-results.png', fullPage: true })
  await page.getByRole('button', { name: /Springfield, Massachusetts/ }).click()
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
    'Springfield, Massachusetts, United States',
  )
  await expect(save).toBeEnabled()
  await page.screenshot({ path: 'test-results/location-confirmation.png', fullPage: true })
  const posted = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/locations'),
  )
  await save.click()
  const body = (await posted).postDataJSON()
  expect(body.latitude).toBe(42.1015)
  expect(body.longitude).toBe(-72.5898)
  await expect(
    page.getByRole('cell', { name: 'Springfield, Massachusetts, United States', exact: true }),
  ).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'Springfield, Massachusetts, United States' })
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Selected place' })).toBeVisible()
  await expect(save).toBeEnabled()
  await page.getByLabel('Display name', { exact: true }).fill('Springfield, MA')
  await save.click()
  await expect(page.getByRole('cell', { name: 'Springfield, MA', exact: true })).toBeVisible()
})
