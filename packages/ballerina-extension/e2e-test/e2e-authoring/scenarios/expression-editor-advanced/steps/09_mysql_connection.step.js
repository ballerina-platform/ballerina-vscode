{
  const frame = await getBIWebview();
  const panel = frame.locator('[data-testid="side-panel"]').first();

  // Open the node palette and add a MySQL connection
  await clickNextDiagramPlus();
  await panel.getByText('Add Connection', { exact: false }).first().click({ force: true });
  await window.waitForTimeout(3000);

  const search = panel.locator('input[placeholder*="Search"], input[type="text"]').first();
  if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
    await search.fill('mysql');
    await window.waitForTimeout(3000);
  }
  const card = frame.locator('#connector-mysql').first();
  await card.waitFor({ state: 'visible', timeout: 60000 });
  await card.click({ force: true });
  console.log('clicked MySQL connector card');

  // Package load can be slow on a cold pull
  const loading = frame.locator('text=Loading connector package...');
  await loading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await loading.waitFor({ state: 'hidden', timeout: 300000 }).catch(() => {});
  await window.waitForTimeout(2000);

  const nameBox = frame.getByRole('textbox', { name: /Connection Name/i }).first();
  await nameBox.waitFor({ state: 'visible', timeout: 60000 });
  const connectionName = await nameBox.inputValue();
  console.log('connection form open, default name:', connectionName);

  await frame.getByRole('button', { name: 'Save Connection' }).last().click({ force: true });
  console.log('clicked Save Connection, waiting for module pull...');
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const snap = await snapshot().catch(() => '');
    if (snap.includes('mysqlClient') && !snap.includes('Save Connection')) break;
    await window.waitForTimeout(2000);
  }

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const connections = fs.readFileSync(path.join(state.integrationDir, 'connections.bal'), 'utf8');
  if (!connections.includes('final mysql:Client mysqlClient = check new ()')) {
    throw new Error(`connections.bal missing mysql client:\n${connections}`);
  }
  console.log('connections.bal contains mysql:Client mysqlClient');
}
