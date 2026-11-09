import { test, expect } from '@playwright/test'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

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
  await expect(page.locator('p.success')).toContainText('8 records saved')
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
  await expect(page.getByRole('heading', { name: '3 saved locations' })).toBeVisible()
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
  await page.getByRole('link', { name: 'Outbreak map' }).click()
  await expect(page.getByRole('heading', { name: '4 saved locations' })).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(4)
  await expect(
    page.locator('.location-list > div').filter({ hasText: 'Lethbridge' }),
  ).toContainText('No reports in view')
  await page.locator('.leaflet-overlay-pane path[stroke="#839b90"]').click()
  await expect(page.locator('.leaflet-popup')).toContainText('Lethbridge')
  await expect(page.locator('.leaflet-popup')).toContainText('No reports in this view')
  await page.getByRole('combobox', { name: 'Location', exact: true }).click()
  await page.getByRole('option', { name: 'Lethbridge', exact: true }).click()
  await expect(page.getByRole('heading', { name: '1 saved location', exact: true })).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Assessment', exact: true }).click()
  await page.getByRole('option', { name: 'Critical', exact: true }).click()
  await expect(
    page.locator('.location-list > div').filter({ hasText: 'Lethbridge' }),
  ).toContainText('No reports in view')
  await page.reload()
  await expect(page.getByRole('heading', { name: '1 saved location', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByRole('heading', { name: '4 saved locations' })).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(4)

  await page.getByRole('link', { name: 'Reports & data' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  await page.getByLabel('Reported case count').fill('5')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('p.success')).toHaveText('Observation updated.')
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await page.getByRole('button', { name: 'Delete observation', exact: true }).click()
  await expect(page.locator('p.success')).toHaveText('Observation deleted.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Username', { exact: true }).fill('public_browser')
  await page.getByLabel('Email', { exact: true }).fill('public@example.com')
  await page.getByLabel('Password', { exact: true }).fill('public-test-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('Read access', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Public health reports' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reports & data' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Import outbreak data' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Role for public_browser' }).selectOption('analyst')
  await expect(page.locator('p.success')).toContainText('Access updated')
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
  const severity = page.getByRole('combobox', { name: 'Assessment', exact: true })
  await severity.click()
  await page.screenshot({ path: 'test-results/filter-menu-desktop.png', fullPage: false })
  await page.keyboard.press('Home')
  await expect(page.getByRole('option', { name: 'All assessments', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'Unassessed', exact: true })).toBeFocused()
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
  await expect(severity).toHaveText('All assessments')
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

test('investigations, alerts and WHO feeds work through the product screens', async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Investigations', exact: true }).click()
  await page.getByRole('button', { name: 'New investigation' }).click()
  await page.getByLabel('Investigation title').fill('Edmonton influenza response')
  await page.getByLabel('Disease', { exact: true }).fill('influenza')
  await page.getByLabel('Start date', { exact: true }).fill('2026-11-01')
  await page.getByLabel('Edmonton', { exact: true }).check()
  await page
    .getByLabel('Situation summary', { exact: true })
    .fill('Track reported influenza observations and response actions.')
  await page.getByRole('button', { name: 'Save investigation', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Edmonton influenza response', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Available to link', exact: true }).click()
  await page
    .getByRole('checkbox', { name: /Select observation/ })
    .first()
    .check()
  await page.getByRole('button', { name: 'Link selected', exact: true }).click()
  await expect(page.locator('p.success')).toHaveText('Observations linked.')
  await page.getByRole('button', { name: 'Linked', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('cell', { name: 'Edmonton', exact: true })).toBeVisible()
  await page
    .getByLabel('Situation update', { exact: true })
    .fill('Response team reviewed the latest report.')
  await page.getByRole('button', { name: 'Post update', exact: true }).click()
  await expect(
    page.getByText('Response team reviewed the latest report.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit investigation', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('closed')
  await page.getByLabel('End date', { exact: true }).fill('2026-11-03')
  await page.getByRole('button', { name: 'Save investigation', exact: true }).click()
  await expect(
    page.getByText('Status changed from investigating to closed.', { exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/investigation-detail.png', fullPage: true })
  await page.getByRole('link', { name: 'Alerts', exact: true }).click()
  await page.getByRole('button', { name: 'New alert rule' }).click()
  await page.getByLabel('Rule name', { exact: true }).fill('Influenza review threshold')
  await page.getByLabel('Disease (optional)', { exact: true }).fill('influenza')
  await page.getByLabel('Case threshold', { exact: true }).fill('10')
  await page.getByLabel('Reporting window (days)', { exact: true }).fill('7')
  await page.getByRole('button', { name: 'Save rule', exact: true }).click()
  await page.getByLabel('Evaluate through', { exact: true }).fill('2026-11-03')
  await page.getByRole('button', { name: 'Evaluate rules', exact: true }).click()
  await expect(page.locator('.alert-card').first()).toContainText('Influenza review threshold')
  await page.getByRole('button', { name: 'Acknowledge', exact: true }).first().click()
  await expect(page.locator('p.success')).toHaveText('Alert acknowledged.')
  await page.getByRole('combobox', { name: 'Alert status', exact: true }).click()
  await page.getByRole('option', { name: 'Acknowledged', exact: true }).click()
  await page.getByRole('button', { name: 'Resolve', exact: true }).first().click()
  await expect(page.locator('p.success')).toHaveText('Alert resolved.')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Add location' }).click()
  await page.route('**/api/locations/search?*', (route) =>
    route.fulfill({
      json: {
        results: [
          {
            id: 'relation:canada',
            name: 'Canada',
            label: 'Canada',
            latitude: 56,
            longitude: -106,
            administrative_level: 'country',
            country: 'Canada',
            country_code: 'CA',
            region: '',
          },
        ],
      },
    }),
  )
  await page.getByLabel('Search for a place', { exact: true }).fill('Canada')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: /Canada/ }).click()
  await page.getByRole('button', { name: 'Save location', exact: true }).click()
  await page.getByRole('link', { name: 'Data feeds', exact: true }).click()
  await page.getByRole('button', { name: 'Connect feed', exact: false }).click()
  await page.getByLabel('Feed name', { exact: true }).fill('WHO Canada weekly')
  await page.getByRole('combobox', { name: 'Source country', exact: true }).selectOption('CA')
  await page
    .getByRole('combobox', { name: 'Saved country location', exact: true })
    .selectOption({ label: 'Canada' })
  await page.getByLabel('Import reports since', { exact: true }).fill('2026-01-01')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Preview reports', exact: true })
    .click()
  await expect(page.getByRole('region', { name: 'Import preview' })).toContainText(
    '20 reported cases',
  )
  await expect(page.getByRole('dialog').getByText('Unassessed', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Connect feed', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'WHO Canada weekly', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('p.success')).toContainText('2 imported')
  await expect(page.getByRole('cell', { name: 'success', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.locator('p.success')).toContainText('2 unchanged')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Enable', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/feed-history.png', fullPage: true })
  await page.getByRole('link', { name: 'Reports & data', exact: true }).click()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Canada', exact: true }) })
    .first()
  await expect(row).toContainText('Weekly')
  await row.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Observation history' })).toContainText(
    'feed import',
  )
})

test('geography views isolate totals and show historical national boundaries', async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  const bearer = await page.evaluate(() => sessionStorage.getItem('healthmap360-token'))
  const headers = { Authorization: `Bearer ${bearer}` }
  const locations = await (await page.request.get('/api/locations', { headers })).json()
  const canada = locations.find((place: { name: string }) => place.name === 'Canada')
  const current = await (
    await page.request.get(`/api/cases?location_id=${canada.id}`, { headers })
  ).json()
  for (const row of current.items) {
    expect((await page.request.delete(`/api/cases/${row.id}`, { headers })).ok()).toBe(true)
  }
  expect(
    (
      await page.request.post('/api/cases', {
        headers,
        data: {
          location_id: canada.id,
          disease: 'covid-19',
          date: '2021-12-26',
          case_count: 3189913,
          source: 'Historical browser fixture',
          reporting_period_days: 7,
        },
      })
    ).ok(),
  ).toBe(true)
  const provinceResponse = await page.request.post('/api/locations', {
    headers,
    data: {
      name: 'Alberta',
      latitude: 54,
      longitude: -115,
      administrative_level: 'province',
      country_code: 'CA',
      region_code: 'CA-AB',
    },
  })
  expect(provinceResponse.ok()).toBe(true)
  const province = await provinceResponse.json()
  expect(
    (
      await page.request.post('/api/cases', {
        headers,
        data: {
          location_id: province.id,
          disease: 'covid-19',
          date: '2021-12-26',
          case_count: 500,
          reporting_period_days: 7,
        },
      })
    ).ok(),
  ).toBe(true)
  await page.getByRole('link', { name: 'Outbreak map', exact: true }).click()
  await expect(page.locator('.location-list')).not.toContainText('Canada')
  await expect(page.locator('.location-list')).not.toContainText('Alberta')
  await page.getByRole('button', { name: 'National', exact: true }).click()
  await expect(page.locator('.map-total strong')).toHaveText('—')
  await expect(page.getByRole('region', { name: 'Reporting context' })).toContainText('2021-12-26')
  await expect(page.locator('.location-list')).toContainText('No reports in view')
  await page.getByRole('combobox', { name: 'Reporting window', exact: true }).click()
  await page.getByRole('option', { name: 'Latest available week', exact: true }).click()
  await expect(page.locator('.map-total strong')).toHaveText('3,189,913')
  await expect(page.getByRole('region', { name: 'Reporting context' })).toContainText(
    'Historical source',
  )
  await expect(page.locator('.location-list')).toContainText('unassessed')
  await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1)
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveAttribute('fill-opacity', '0.22')
  await page
    .locator('.leaflet-overlay-pane path')
    .click({ position: { x: 130, y: 170 }, force: true })
  await page.reload()
  await expect(page.getByRole('button', { name: 'National', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.map-total strong')).toHaveText('3,189,913')
  await page.screenshot({ path: 'test-results/national-historical-map.png', fullPage: true })
  await page.getByRole('link', { name: 'Review reports', exact: false }).click()
  await expect(page.locator('tbody').first()).toContainText('Canada')
  await expect(page.locator('tbody').first()).not.toContainText('Edmonton')
  await page.getByRole('link', { name: 'Outbreak map', exact: true }).click()
  await page.getByRole('button', { name: 'Regional', exact: true }).click()
  await page.getByRole('combobox', { name: 'Reporting window', exact: true }).click()
  await page.getByRole('option', { name: 'Historical range', exact: true }).click()
  await expect(page.locator('.map-total strong')).toHaveText('500')
  await expect(page.locator('.location-list')).toContainText('Alberta')
  await expect(page.locator('.location-list')).not.toContainText('Canada')
  await expect(page.locator('.leaflet-overlay-pane path.leaflet-interactive')).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Regional', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/regional-map-mobile.png', fullPage: true })
  expect(errors).toEqual([])
})

test('publication review controls anonymous access and withdrawal', async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Publication review', exact: true }).click()
  await page.getByRole('button', { name: 'Prepare publication', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Reporting area', exact: true })
    .selectOption({ label: 'Canada · national' })
  await page.getByLabel('Disease', { exact: true }).fill('covid-19')
  await page.getByLabel('First report date').fill('2021-01-01')
  await page.getByLabel('Last report date').fill('2021-12-31')
  await page.getByLabel('Public title', { exact: true }).fill('Historical Canada · browser fixture')
  await page.getByLabel('Public reporting area name').fill('Canada')
  await page
    .getByLabel('Public summary')
    .fill('Historical browser fixture for publication access testing; not live surveillance.')
  await page
    .getByLabel('Methodology and limitations')
    .fill(
      'Reported weekly totals for a historical browser fixture. Missing reports do not mean zero cases.',
    )
  await page.getByLabel('Public source name').fill('Historical browser fixture')
  await page
    .getByLabel('Source methodology URL')
    .fill('https://data.who.int/dashboards/covid19/data')
  await page.getByRole('button', { name: 'Create private draft', exact: true }).click()
  await expect(page.locator('p.success')).toContainText('Private draft created')
  await expect(page.getByRole('button', { name: 'Publish reviewed snapshot' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /I reviewed the source/ }).check()
  await page.getByRole('button', { name: 'Publish reviewed snapshot' }).click()
  await expect(page.locator('p.success')).toContainText('Snapshot published')
  await page.setViewportSize({ width: 1280, height: 600 })
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('link', { name: /View published reports without signing in/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Historical Canada · browser fixture' }),
  ).toBeVisible()
  await expect(page.locator('article strong').filter({ hasText: '3,189,913' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Investigations', exact: true })).toHaveCount(0)
  expect((await page.request.get('/api/outbreaks/1')).status()).toBe(401)
  await page.getByRole('button', { name: 'Show map and timeline', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Published reporting evidence' })).toBeVisible()
  await expect(page.locator('.public-map .leaflet-overlay-pane path')).toHaveCount(1)
  await page.getByRole('link', { name: 'Canada →', exact: true }).click()
  await expect(page).toHaveURL(/public\/locations\//)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: 'test-results/public-report-mobile.png', fullPage: true })
  await page.getByRole('link', { name: 'Analyst sign in', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Publication review', exact: true }).click()
  await page.getByRole('button', { name: 'Withdraw publication', exact: true }).click()
  await expect(page.locator('p.success')).toContainText('Publication withdrawn')
  await page.getByRole('link', { name: /Open public reports/ }).click()
  await expect(
    page.getByRole('heading', { name: 'No published reports in this view' }),
  ).toBeVisible()
})

test('location deletion and reversible archive preserve reporting history', async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  const token = await page.evaluate(() => sessionStorage.getItem('healthmap360-token'))
  const headers = { Authorization: `Bearer ${token}` }
  const create = async (name: string) => {
    const response = await page.request.post('/api/locations', {
      headers,
      data: { name, latitude: 53, longitude: -113 },
    })
    expect(response.status()).toBe(201)
    return response.json()
  }
  const unused = await create('Unused browser location')
  const linked = await create('Archived browser location')
  const record = await page.request.post('/api/cases', {
    headers,
    data: {
      location_id: linked.id,
      date: new Date().toISOString().slice(0, 10),
      disease: 'influenza',
      case_count: 42,
    },
  })
  expect(record.status()).toBe(201)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  const unusedRow = page.getByRole('row').filter({ hasText: unused.name })
  await unusedRow.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(unusedRow).toBeVisible()
  await unusedRow.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete unused location', exact: true }).click()
  await expect(unusedRow).toHaveCount(0)
  const linkedRow = page.getByRole('row').filter({ hasText: linked.name })
  await linkedRow.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('cannot be deleted')
  await expect(
    page.getByRole('button', { name: 'Delete unused location', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Archive instead', exact: true }).click()
  await page.getByRole('button', { name: 'Archive location', exact: true }).click()
  await expect(linkedRow).toHaveCount(0)
  await page.getByRole('link', { name: 'Outbreak map', exact: true }).click()
  await expect(page.locator('.location-list')).not.toContainText(linked.name)
  await page.getByRole('link', { name: 'Reports & data', exact: true }).click()
  await expect(page.getByRole('cell', { name: new RegExp(linked.name) })).toBeVisible()
  await expect(page.getByRole('cell', { name: new RegExp(linked.name) })).toContainText(
    'Archived location',
  )
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Show archived locations' }).check()
  await expect(linkedRow).toContainText('Archived')
  await linkedRow.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Restore location', exact: true }).click()
  await expect(linkedRow).toContainText('Active')
  await page.getByRole('link', { name: 'Outbreak map', exact: true }).click()
  await expect(page.locator('.location-list')).toContainText(linked.name)
  const reports = await page.request.get(`/api/cases?location_id=${linked.id}`, { headers })
  expect(JSON.stringify(await reports.json())).toContain('42')
})

test('regional weekly review compares evidence, qualifies rates and hands off to investigations', async ({
  page,
}) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  const token = await page.evaluate(() => sessionStorage.getItem('healthmap360-token'))
  const headers = { Authorization: `Bearer ${token}` }
  const response = await page.request.post('/api/locations', {
    headers,
    data: {
      name: 'Alberta weekly review fixture',
      latitude: 53,
      longitude: -113,
      country_code: 'CA',
      region_code: 'CA-AB',
      administrative_level: 'province',
    },
  })
  expect(response.status()).toBe(201)
  const area = await response.json()
  for (const [date, count] of [
    ['2025-10-18', 100],
    ['2025-10-25', 150],
  ] as const) {
    expect(
      (
        await page.request.post('/api/cases', {
          headers,
          data: {
            location_id: area.id,
            date,
            disease: 'influenza',
            case_count: count,
            reporting_period_days: 7,
            source: 'Browser review fixture',
          },
        })
      ).status(),
    ).toBe(201)
  }
  const url = `/#/review?location_id=${area.id}&disease=influenza&date_to=2025-10-25`
  await page.goto(url)
  const region = page.getByRole('region', { name: `${area.name} weekly review`, exact: true })
  await expect(region).toContainText('+50 reported cases')
  await expect(region).toContainText('(+50%)')
  await expect(region).toContainText('Add a population, reference year')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page
    .getByRole('row')
    .filter({ hasText: area.name })
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await page.getByText('Optional details', { exact: true }).click()
  await page.getByLabel('Population', { exact: true }).fill('1000000')
  await page.getByLabel('Population reference year').fill('2025')
  await page.getByLabel('Population source URL').fill('https://example.com/population')
  await page
    .getByRole('checkbox', {
      name: 'I verified that this population covers exactly this reporting area.',
    })
    .check()
  await page.getByRole('button', { name: 'Save location', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto(url)
  await expect(region).toContainText('Reported cases per 100,000 people: 15')
  await page.getByLabel('Analyst notes').fill('Review testing changes before publication.')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export private review', exact: true }).click()
  const exported = await download
  expect(exported.suggestedFilename()).toBe('healthmap360-private-review-2025-10-25.json')
  const evidence = JSON.parse(await readFile((await exported.path())!, 'utf8'))
  expect(evidence.status).toBe('private_working_review_not_approved_for_publication')
  expect(evidence.analyst_notes).toBe('Review testing changes before publication.')
  expect(evidence.areas[0].rate.reported_cases_per_100000).toBe(15)
  await page.route('**/api/review/laboratory?*', (route) =>
    route.fulfill({ status: 502, json: { detail: 'Laboratory source temporarily unavailable' } }),
  )
  await page.getByRole('button', { name: 'Load PHAC laboratory context' }).click()
  await expect(page.getByRole('alert')).toContainText('Laboratory source temporarily unavailable')
  await expect(region).toContainText('+50 reported cases')
  await region.getByRole('button', { name: 'Start investigation', exact: true }).click()
  await expect(page.getByLabel('Disease', { exact: true })).toHaveValue('influenza')
  await expect(page.getByRole('checkbox', { name: area.name, exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Save investigation', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: `${area.name} · influenza review`, exact: true }),
  ).toBeVisible()
  await page.goto(url)
  await expect(region).toContainText('Existing open investigations')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: 'test-results/weekly-review-mobile.png', fullPage: true })
})

test('weekly review demo explains calculations without creating surveillance records', async ({
  page,
}) => {
  await page.goto('/#/review?demo=complete')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Demo walkthrough' })).toContainText(
    'FICTIONAL DEMO',
  )
  const area = page.getByRole('region', { name: 'Alberta · fictional training area weekly review' })
  await expect(area).toContainText('+50 reported cases')
  await expect(area).toContainText('(+50%)')
  await expect(area).toContainText('Reported cases per 100,000 people: 15')
  await expect(page.getByRole('button', { name: 'Start investigation', exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByRole('button', { name: 'Load PHAC laboratory context' })).toHaveCount(0)
  await page.getByRole('link', { name: '2. Incomplete reporting', exact: true }).click()
  await expect(area).toContainText('3 / 7')
  await expect(area).toContainText('Week-to-week change: Unavailable')
  await expect(area).toContainText('Reported cases per 100,000 people: Unavailable')
  await page.getByRole('link', { name: '3. Missing population', exact: true }).click()
  await expect(area).toContainText('+50 reported cases')
  await expect(area).toContainText('Reported cases per 100,000 people: Unavailable')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export private review', exact: true }).click()
  const downloaded = await pending
  const body = JSON.parse(await readFile((await downloaded.path())!, 'utf8'))
  expect(body.demonstration).toBe(true)
  expect(body.status).toBe('fictional_demonstration_not_for_publication')
  await page.getByRole('link', { name: 'Return to live review', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Demo walkthrough' })).toHaveCount(0)
})
