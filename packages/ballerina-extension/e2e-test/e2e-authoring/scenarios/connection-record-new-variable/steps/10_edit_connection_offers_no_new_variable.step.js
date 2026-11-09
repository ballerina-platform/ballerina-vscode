{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const connectionName = state.httpConnectionName;
  const connectionsPath = path.join(state.integrationDir, 'connections.bal');

  // Open the saved connection for editing from the integration overview.
  let frame = await getBIWebview();
  const home = frame.locator('[data-testid="home-button"]');
  if (await home.isVisible({ timeout: 5000 }).catch(() => false)) await home.click({ force: true });
  await navigateToIntegrationOverview(state.integrationName);
  frame = await getBIWebview();
  const connNode = frame.locator(`[data-testid="connection-node-${connectionName}"]`);
  await connNode.waitFor({ state: 'visible', timeout: 60000 });
  await connNode.click({ force: true });
  frame = await getBIWebview();
  const urlEditor = frame.locator('[data-testid="ex-editor-url"] .cm-content').first();
  await urlEditor.waitFor({ state: 'visible', timeout: 30000 });
  console.log('edit connection form open');

  const urlIndex = await urlEditor.evaluate((el) => [...document.querySelectorAll('.cm-content')].indexOf(el));
  await cmFill('', urlIndex);
  await urlEditor.click({ force: true });
  await window.waitForTimeout(2000);
  await frame.getByText('Variables', { exact: true }).last().click({ force: true });
  await frame.getByText('No variables found', { exact: true }).or(frame.locator('[data-testid^="helper-pane-item-"]'))
    .first().waitFor({ state: 'visible', timeout: 30000 });
  await window.waitForTimeout(1500);
  if (await frame.getByText('New Variable', { exact: true }).last().isVisible().catch(() => false)) {
    throw new Error('the edit connection form offers "+ New Variable"');
  }
  console.log('the edit form helper pane offers no "+ New Variable"');

  await window.keyboard.press('Escape');
  await window.waitForTimeout(1000);
  await cmFill('"https://edit.example"', urlIndex);
  await window.waitForTimeout(2000);
  await frame.getByRole('button', { name: /Update Connection|Save/i }).last().click({ force: true });
  const deadline = Date.now() + 60000;
  let saved = '';
  while (Date.now() < deadline) {
    saved = fs.readFileSync(connectionsPath, 'utf8');
    if (saved.replace(/\s+/g, '').includes(`${connectionName}=checknew("https://edit.example"`)) break;
    await window.waitForTimeout(1000);
  }
  if (!saved.replace(/\s+/g, '').includes(`${connectionName}=checknew("https://edit.example",http1Settings={proxy:{host:"proxy.local"}})`)) {
    throw new Error(`edited connection not saved:\n${saved}`);
  }
  await window.waitForTimeout(5000);
  const status = await window.locator('.statusbar-item').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') || '').filter((label) => /^(Errors|Warnings|No Problems)/.test(label)));
  if (status.some((label) => label.startsWith('Errors'))) throw new Error(`the project does not compile: ${status}`);
  console.log(`edited connection saved; no compile errors (${status.join(', ')}):\n${saved}`);
}
