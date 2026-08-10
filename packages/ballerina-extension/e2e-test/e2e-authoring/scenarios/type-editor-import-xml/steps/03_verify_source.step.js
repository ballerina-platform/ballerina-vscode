{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));

  // Step 16: Derive the actual type name from the diagram node
  const frame = await getBIWebview();
  const typeNode = frame.locator('[data-testid^="type-node-"]').first();
  await typeNode.waitFor({ timeout: 15000 });
  const testId = await typeNode.getAttribute('data-testid');
  const typeName = testId.replace('type-node-', '');
  console.log(`inferred type name: ${typeName}`);

  // Verify types.bal contains the inferred type name
  const candidates = [
    path.join(state.integrationDir, 'types.bal'),
    path.join(state.projectDir, 'types.bal'),
  ];
  let source = '';
  for (const p of candidates) {
    if (fs.existsSync(p)) { source = fs.readFileSync(p, 'utf8'); break; }
  }
  if (!source) throw new Error('types.bal not found');
  // Scope the field check to the generated record's own block so matches
  // elsewhere in the file (e.g. from prior scenarios) can't false-positive.
  const recordMatch = source.match(new RegExp(`type\\s+${typeName}\\s+record\\s*{[|]?\\s*([\\s\\S]*?)\\};`));
  if (!recordMatch) {
    throw new Error(`types.bal does not contain a "${typeName}" record.\n---\n${source}`);
  }
  const recordBody = recordMatch[1];
  // Verify child elements name and age were captured as fields
  if (!/\bname\s*;/.test(recordBody) || !/\bage\s*;/.test(recordBody)) {
    throw new Error(`"${typeName}" record is missing expected fields from XML.\n---\n${recordBody}`);
  }
  console.log(`source verified: ${typeName} record with name/age fields present`);

  // Step 17: Confirm diagram node still visible
  await typeNode.waitFor({ timeout: 10000 });
  console.log(`diagram verified: ${testId} present`);
}
