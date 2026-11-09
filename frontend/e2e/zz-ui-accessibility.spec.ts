import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFile } from 'node:fs/promises'

test('all workspace screens and forms meet automated accessibility checks', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000)
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort())
  const findings: { screen: string; violations: unknown[]; incomplete: number }[] = []
  async function scan(screen: string) {
    await expect(page.getByText('Loading workspace data…', { exact: true })).toHaveCount(0)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze()
    findings.push({
      screen,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      incomplete: result.incomplete.length,
    })
  }
  await page.goto('/')
  await scan('sign-in')
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click()
  await scan('registration')
  await page.getByRole('button', { name: 'Already have an account? Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Recover account', exact: true }).click()
  await scan('recovery')
  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Public health, in focus.' })).toBeVisible()
  const token = await page.evaluate(() => sessionStorage.getItem('healthmap360-token'))
  const headers = { Authorization: `Bearer ${token}` }
  const today = (await (await page.request.get('/api/public/config')).json()).today
  const location = await (
    await page.request.post('/api/locations', {
      headers,
      data: {
        name: 'Accessibility fixture area',
        latitude: 53,
        longitude: -113,
        administrative_level: 'city',
        country_code: 'CA',
      },
    })
  ).json()
  await page.request.post('/api/cases', {
    headers,
    data: {
      location_id: location.id,
      disease: 'influenza',
      date: today,
      reporting_period_days: 7,
      case_count: 15,
      source: 'Accessibility fixture',
    },
  })
  const investigation = await (
    await page.request.post('/api/outbreaks', {
      headers,
      data: {
        title: 'Accessibility fixture investigation',
        disease: 'influenza',
        started_on: today,
        location_ids: [location.id],
      },
    })
  ).json()
  await page.request.post('/api/resources', {
    headers,
    data: { type: 'Audit stock', quantity: 100, location_id: location.id, allocated_date: today },
  })
  await page.request.post('/api/alert-rules', {
    headers,
    data: {
      name: 'Accessibility fixture rule',
      threshold: 5,
      window_days: 7,
      geographic_scope: 'local',
      location_id: location.id,
    },
  })
  const publication = await (
    await page.request.post('/api/publications', {
      headers,
      data: {
        location_id: location.id,
        disease: 'influenza',
        date_from: today,
        date_to: today,
        title: 'Accessibility fixture publication',
        public_name: 'Fictional reporting area',
        summary: 'Disposable browser fixture used to assess interface accessibility.',
        methodology:
          'Aggregate reporting counts for an isolated automated browser test; not actual surveillance.',
        source_name: 'Accessibility test fixture',
        source_url: 'https://example.com/source',
      },
    })
  ).json()
  await page.request.post(`/api/publications/${publication.id}/publish`, {
    headers,
    data: { reviewed: true },
  })
  await page.goto('/#/reports')
  const routes = [
    '',
    'review',
    'review?demo=complete',
    'map',
    'reports',
    'outbreaks',
    `outbreaks/${investigation.id}`,
    'alerts',
    'feeds',
    'data-health',
    'publications',
    'resources',
    'settings',
    'public',
  ]
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 })
    for (const route of routes) {
      await page.goto(`/#/${route}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await scan(`${width}:${route || 'overview'}`)
      await expect
        .poll(
          () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          { message: `No page overflow at ${width}:${route}` },
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(
          `${width}-${route.replace(/[^a-z0-9]/gi, '-') || 'overview'}.png`,
        ),
        fullPage: true,
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  for (const [route, button] of [
    ['settings', 'Add location'],
    ['resources', 'Add resource'],
    ['outbreaks', 'New investigation'],
    ['alerts', 'New alert rule'],
    ['feeds', 'Connect feed'],
  ] as const) {
    await page.goto(`/#/${route}`)
    await page.getByRole('button', { name: button, exact: false }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await scan(`dialog:${button}`)
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  }
  // Exercise the mandatory enrollment UI without enrolling or changing an account.
  await page.route('**/api/auth/me', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      json: { ...(await response.json()), mfa_enabled: false, mfa_required: true },
    })
  })
  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Administrator authenticator required' }),
  ).toBeVisible()
  await scan('mandatory-authenticator-enrollment')
  await testInfo.attach('accessibility-results', {
    body: JSON.stringify(findings, null, 2),
    contentType: 'application/json',
  })
  await writeFile(testInfo.outputPath('accessibility.json'), JSON.stringify(findings, null, 2))
  if (process.env.HEALTHMAP_AUDIT_BASELINE)
    await writeFile('/tmp/healthmap-ui-baseline.json', JSON.stringify(findings, null, 2))
  else
    expect(
      findings.filter((f) => f.violations.length),
      JSON.stringify(
        findings.filter((f) => f.violations.length),
        null,
        2,
      ),
    ).toEqual([])
})

test('keyboard navigation, guide and mobile menu retain user control', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Username', { exact: true }).fill('browser_admin')
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.goto('/#/reports')
  await page.reload()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page).toHaveURL(/#\/reports$/)
  const guide = page.getByRole('button', { name: 'Workspace guide', exact: true })
  await guide.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.keyboard.press('Tab')
  expect(
    await page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement)),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(guide).toBeFocused()
  await page.setViewportSize({ width: 320, height: 800 })
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation', exact: true })
  await expect(drawer).toBeVisible()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.click()
  await drawer.getByRole('link', { name: 'Reports & data', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Reports & data', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
})
