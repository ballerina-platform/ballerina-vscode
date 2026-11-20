{
  const frame = await getBIWebview();
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const connectionName = await frame.getByRole('textbox', { name: /Connection Name/i }).first().inputValue();
  // The status bar's problems item ("Errors: 1, Warnings: 2", "Infos: 3", "No Problems"), or '' before it is drawn.
  const problems = async () => (await window.locator('.statusbar-item, .statusbar-item-label').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') || '').find((label) => /^(Errors|Warnings|Infos|No Problems)/.test(label)))) || '';
  const warnings = (label) => Number(/Warnings: (\d+)/.exec(label)?.[1] ?? 0);
  const warningsBefore = warnings(await problems());

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

  // No compile errors. A count read now can still be the one from before the save, so wait for the compiler's
  // verdict on the saved connection: the http module reports ClientHttp1Settings.proxy as deprecated, a warning
  // that nothing before the save produced. Errors from the same compilation are published with it.
  let status = await problems();
  for (const seenBy = Date.now() + 60000; warnings(status) <= warningsBefore && Date.now() < seenBy; ) {
    await window.waitForTimeout(1000);
    status = await problems();
  }
  if (warnings(status) <= warningsBefore) {
    throw new Error(`no compiler verdict on the saved connection (problems: ${JSON.stringify(status)}): cannot tell whether the project compiles`);
  }
  if (status.startsWith('Errors')) throw new Error(`the project does not compile: ${status}`);

  // The sources the compiler has now seen compile. Step 10 checks its edit against them.
  const compiledSources = Object.fromEntries(fs.readdirSync(state.integrationDir).filter((file) => file.endsWith('.bal')).sort()
    .map((file) => [file, fs.readFileSync(path.join(state.integrationDir, file), 'utf8').replace(/\s+/g, '')]));
  fs.writeFileSync(path.join(sessionDir, 'state.json'),
    JSON.stringify({ ...state, httpConnectionName: connectionName, compiledSources }, null, 2));
  console.log(`saved ${connectionName}; no compile errors (${status})`);
}
