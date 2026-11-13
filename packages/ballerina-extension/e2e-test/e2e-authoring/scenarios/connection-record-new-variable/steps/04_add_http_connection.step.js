{
  const frame = await getBIWebview();
  const panel = frame.locator('[data-testid="side-panel"]').first();

  await clickNextDiagramPlus();
  await panel.getByText('Add Connection', { exact: false }).first().click({ force: true });
  await window.waitForTimeout(3000);
  console.log('Add Connection popup opened');

  const search = panel.locator('input[placeholder*="Search"], input[type="text"]').first();
  if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
    await search.fill('http');
    await window.waitForTimeout(3000);
  }
  const card = frame.locator('#connector-http').first();
  await card.waitFor({ state: 'visible', timeout: 60000 });
  await card.click({ force: true });
  console.log('clicked HTTP connector card');

  const loading = frame.locator('text=Loading connector package...');
  await loading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await loading.waitFor({ state: 'hidden', timeout: 300000 }).catch(() => {});
  await window.waitForTimeout(2000);

  const saveBtn = frame.getByRole('button', { name: 'Save Connection' }).last();
  await saveBtn.waitFor({ state: 'visible', timeout: 60000 });
  console.log('HTTP client connection form is visible');
}
