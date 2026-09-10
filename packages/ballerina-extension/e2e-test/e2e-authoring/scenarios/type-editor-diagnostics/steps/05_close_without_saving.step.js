{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const frame = await getBIWebview();

  // Leave the project as step 02 left it — the probe type is discarded.
  await frame.locator('[data-testid="close-panel-btn"]').click({ force: true });
  await frame.getByRole('button', { name: 'Add Type' }).waitFor({ state: 'visible', timeout: 60000 });
  console.log('panel closed, back on the type diagram');

  if (await frame.locator('[data-testid="type-node-DiagnosticsProbe"]').count()) {
    throw new Error('DiagnosticsProbe was saved even though the panel was closed without saving');
  }

  const candidates = [
    path.join(state.integrationDir, 'types.bal'),
    path.join(state.projectDir, 'types.bal'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('types.bal not found in project or integration directory');
  const source = fs.readFileSync(found, 'utf8');
  if (source.includes('DiagnosticsProbe') || source.includes('NoSuchTypeHere')) {
    throw new Error(`types.bal picked up the discarded type:\n---\n${source}`);
  }
  console.log('source verified: only Organization present, invalid form discarded');
}
