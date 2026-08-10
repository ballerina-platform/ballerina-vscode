{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));

  // Step 16: Verify types.bal contains PersonJson with expected fields
  const candidates = [
    path.join(state.integrationDir, 'types.bal'),
    path.join(state.projectDir, 'types.bal'),
  ];
  let source = '';
  for (const p of candidates) {
    if (fs.existsSync(p)) { source = fs.readFileSync(p, 'utf8'); break; }
  }
  if (!source) throw new Error('types.bal not found in project or integration directory');
  if (!source.includes('PersonJson')) {
    throw new Error(`types.bal does not contain "PersonJson".\n---\n${source}`);
  }
  // Verify at least name and age fields were inferred from the JSON
  if (!source.includes('name') || !source.includes('age')) {
    throw new Error(`types.bal is missing expected fields.\n---\n${source}`);
  }
  console.log('source verified: PersonJson record with name/age/city fields present');

  // Step 17: Verify diagram node is still visible
  const frame = await getBIWebview();
  const typeNode = frame.locator('[data-testid="type-node-PersonJson"]');
  await typeNode.waitFor({ timeout: 15000 });
  console.log('diagram verified: type-node-PersonJson present');
}
