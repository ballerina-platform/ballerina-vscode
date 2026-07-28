{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const connectionName = state.httpConnectionName;

let frame = await getBIWebview();
  const home = frame.locator('[data-testid="home-button"]');
  if (await home.isVisible({ timeout: 5000 }).catch(() => false)) {
    await home.click({ force: true });
  }
  await navigateToIntegrationOverview(state.integrationName);
  frame = await getBIWebview();

  const connNode = frame.locator(`[data-testid="connection-node-${connectionName}"]`);
  await connNode.waitFor({ state: 'visible', timeout: 60000 });
  await connNode.click({ force: true });
  console.log(`clicked ${connectionName} connection node in architecture diagram`);

  frame = await getBIWebview();
  const urlLabel = frame.getByText('Url', { exact: false }).first();
  await urlLabel.waitFor({ state: 'visible', timeout: 30000 });
  await cmFill('https://foo.bar/baz/updated', 0);
  await dismissHelperPanel();

  const saveBtn = frame.getByRole('button', { name: /Update Connection|Save/i }).last();
  await saveBtn.waitFor({ state: 'visible', timeout: 30000 });
  await saveBtn.click({ force: true });
  console.log('saved edited url for httpClient');

  const deadline = Date.now() + 60000;
  let source = '';
  while (Date.now() < deadline) {
    source = fs.readFileSync(path.join(state.integrationDir, 'connections.bal'), 'utf8');
    if (source.includes('foo.bar/baz/updated')) break;
    await window.waitForTimeout(1000);
  }
  if (!source.includes('foo.bar/baz/updated')) {
    throw new Error(`connections.bal was not updated with the new url:\n${source}`);
  }
  console.log('connections.bal contains the updated url and was saved correctly');
}
