const { test, expect } = require('@playwright/test');
const fixture = process.env.CANOPY_TEST_FIXTURE ? JSON.parse(process.env.CANOPY_TEST_FIXTURE) : null;

test('cloud sign-in errors stay actionable and credentials are not persisted', async ({ page }) => {
  await page.route('**/auth/v1/token?grant_type=password', route => route.fulfill({
    status: 400, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }),
  }));
  await page.goto('/dist/cloud.html');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('fake@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fake-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Sign-in failed. Check your credentials or contact your administrator.');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth')))).toEqual([]);
});

test('cloud owner signs in, creates a shared client, refreshes and signs out', async ({ page }) => {
  test.skip(!fixture, 'Run npm run test:integration with the actual local Supabase fixture.');
  await page.goto('/dist/cloud.html');
  await page.getByLabel('Email', { exact: true }).fill(fixture.owner.email);
  await page.getByLabel('Password', { exact: true }).fill(fixture.owner.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(fixture.clientName, { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.hiddenName, { exact: true })).toBeVisible();
  const name = `Browser sample ${test.info().project.name}`;
  await page.getByLabel('Client name').fill(name);
  await page.getByRole('button', { name: 'Save client', exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh records' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth')))).toEqual([]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});

test('cloud employee sees assigned jobs only and has no create controls', async ({ page }) => {
  test.skip(!fixture, 'Run npm run test:integration with the actual local Supabase fixture.');
  await page.goto('/dist/cloud.html');
  await page.getByLabel('Email', { exact: true }).fill(fixture.employee.email);
  await page.getByLabel('Password', { exact: true }).fill(fixture.employee.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(fixture.projectName, { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.hiddenName, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save client' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
});

test('a real authenticated user without membership receives no organization access', async ({ page }) => {
  test.skip(!fixture, 'Run npm run test:integration with the actual local Supabase fixture.');
  await page.goto('/dist/cloud.html');
  await page.getByLabel('Email', { exact: true }).fill(fixture.outsider.email);
  await page.getByLabel('Password', { exact: true }).fill(fixture.outsider.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('No organization access.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save client' })).toHaveCount(0);
});

test('provider invitation sets a password without granting organization access', async ({ page }) => {
  test.skip(!fixture, 'Run npm run test:integration with the actual local Supabase fixture.');
  const invite = fixture.invites[test.info().project.name];
  await page.goto(invite.link);
  await expect(page.getByText('No organization access.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => !location.hash.includes('access_token'))).toBe(true);
  await page.getByRole('button', { name: 'Set or change password' }).click();
  await page.getByLabel('New password (at least 12 characters)').fill(invite.password);
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  // USER_UPDATED may redraw the workspace after the successful provider request.
  await expect(page.getByLabel('New password (at least 12 characters)')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(invite.email);
  await page.getByLabel('Password', { exact: true }).fill(invite.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('No organization access.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth')))).toEqual([]);
});
