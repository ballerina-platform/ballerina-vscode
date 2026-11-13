{
  const frame = await getBIWebview();
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const connectionName = await frame.getByRole('textbox', { name: /Connection Name/i }).first().inputValue();

  await frame.getByRole('button', { name: 'Save Connection' }).last().click({ force: true });
  const connectionsPath = path.join(state.integrationDir, 'connections.bal');
  const deadline = Date.now() + 120000;
  let connections = '';
  while (Date.now() < deadline) {
    connections = fs.existsSync(connectionsPath) ? fs.readFileSync(connectionsPath, 'utf8') : '';
    if (connections.includes(connectionName)) break;
    await window.waitForTimeout(1000);
  }
  const compact = connections.replace(/\s+/g, '');
  if (!compact.includes(`${connectionName}=checknew("https://foo.bar/baz",http1Settings={proxy:{host:"proxy.local"}})`)) {
    throw new Error(`connection not saved as entered:\n${connections}`);
  }
  // No compile errors. (The http module reports ClientHttp1Settings.proxy as deprecated: a warning.)
  await window.waitForTimeout(5000);
  const status = await window.locator('.statusbar-item').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') || '').filter((label) => /^(Errors|Warnings|No Problems)/.test(label)));
  if (status.some((label) => label.startsWith('Errors'))) throw new Error(`the project does not compile: ${status}`);
  fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify({ ...state, httpConnectionName: connectionName }, null, 2));
  console.log(`saved ${connectionName}; no compile errors (${status.join(', ')})`);
}
