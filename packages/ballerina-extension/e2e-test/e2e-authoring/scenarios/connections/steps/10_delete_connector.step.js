{
  const frame = await getBIWebview();

  const petstoreNode = frame.locator('[data-testid^="connection-node-"]', { hasText: 'petstore' }).first();
  await petstoreNode.waitFor({ state: 'visible', timeout: 30000 });
  const petstoreTestId = await petstoreNode.getAttribute('data-testid');

  const menuBtn = frame.locator(`[data-testid="${petstoreTestId}-menu"]`);
  await menuBtn.waitFor({ state: 'visible', timeout: 15000 });
  await menuBtn.click({ force: true });
  console.log('opened three-dot menu on petstore connector');

  const deleteItem = frame.getByText('Delete', { exact: true });
  await deleteItem.waitFor({ state: 'visible', timeout: 10000 });
  await deleteItem.click({ force: true });
  console.log('clicked Delete in connector menu');

  await frame.locator(`[data-testid="${petstoreTestId}"]`).waitFor({ state: 'detached', timeout: 30000 });
  console.log('petstore connector node removed from the architecture diagram');

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const deadline = Date.now() + 30000;
  let connections = '';
  while (Date.now() < deadline) {
    connections = fs.readFileSync(path.join(state.integrationDir, 'connections.bal'), 'utf8');
    if (!connections.toLowerCase().includes('petstore')) break;
    await window.waitForTimeout(1000);
  }
  if (connections.toLowerCase().includes('petstore')) {
    throw new Error(`connections.bal still contains the petstore connector after delete:\n${connections}`);
  }
  if (!connections.includes(state.httpConnectionName)) {
    throw new Error(`connections.bal is missing the remaining ${state.httpConnectionName} client:\n${connections}`);
  }
  console.log('connections.bal verified: petstore connector deleted, httpClient remains');
}
