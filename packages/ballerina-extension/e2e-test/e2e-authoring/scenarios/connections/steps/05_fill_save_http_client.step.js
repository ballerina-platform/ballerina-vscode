{
  const frame = await getBIWebview();

  const nameBox = frame.getByRole('textbox', { name: /Connection Name/i }).first();
  await nameBox.waitFor({ state: 'visible', timeout: 60000 });
  const connectionName = await nameBox.inputValue();
  console.log('connection form open, default name:', connectionName);

  // Fill the client URL via the CodeMirror expression editor (first editor
  // on the form, matches the pattern used by the standalone connection
  // artifact form).
  await cmFill('https://foo.bar/baz', 0);

  await frame.getByRole('button', { name: 'Save Connection' }).last().click({ force: true });
  console.log('clicked Save Connection, waiting for module pull...');

  const deadline = Date.now() + 300000;
  let saved = false;
  while (Date.now() < deadline) {
    const snap = await snapshot().catch(() => '');
    if (snap.includes(connectionName) && !snap.includes('Save Connection')) { saved = true; break; }
    await window.waitForTimeout(2000);
  }
  if (!saved) throw new Error('timed out waiting for httpClient connection to be saved');

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify({ ...state, httpConnectionName: connectionName }, null, 2));

  const fileDeadline = Date.now() + 30000;
  let connections = '';
  while (Date.now() < fileDeadline) {
    connections = fs.readFileSync(path.join(state.integrationDir, 'connections.bal'), 'utf8');
    if (connections.includes(connectionName)) break;
    await window.waitForTimeout(1000);
  }
  if (!connections.includes(connectionName)) {
    throw new Error(`connections.bal missing ${connectionName}:\n${connections}`);
  }
  console.log(`connections.bal contains ${connectionName}; connection shown in side panel`);
}
