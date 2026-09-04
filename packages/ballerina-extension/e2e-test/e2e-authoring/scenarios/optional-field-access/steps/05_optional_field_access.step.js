{
  const frame = await getBIWebview();

  // Declare Variable node: string? docId = <helper-pane-built expression>
  await selectFlowNode('Declare Variable', 'Statement');
  await fillFlowNodeForm({
    'Name*Name of the variable': { type: 'input', value: 'docId' },
    'Type': { type: 'textarea', value: 'string?', additionalProps: { clickLabel: true } }
  });
  await dismissHelperPanel();
  console.log('Declare Variable form open, name=docId type=string?');

  // Focus the Expression editor — this opens the helper pane (Inputs /
  // Variables / Configurables / Functions).
  const expr = frame.locator('[data-testid="side-panel"] .cm-content').last();
  await expr.waitFor({ state: 'visible', timeout: 15000 });
  await expr.click({ force: true });
  await window.waitForTimeout(1000);
  console.log('helper pane snapshot:\n' + (await snapshot('Variables|Configurables|Functions|Inputs|doc').catch(() => '')));

  // Open the Variables section.
  const variablesTab = frame.getByText('Variables', { exact: true }).last();
  await variablesTab.waitFor({ state: 'visible', timeout: 15000 });
  await variablesTab.click({ force: true });
  await window.waitForTimeout(1000);
  console.log('opened Variables section');
  console.log('helper testids:', JSON.stringify(
    (await listTestIds().catch(() => [])).filter((id) => id.startsWith('helper-pane-'))
  ));

  // Drill into `doc` via its navigation arrow (records show the chevron).
  const docNav = frame.locator('[data-testid="helper-pane-nav-doc"]').first();
  await docNav.waitFor({ state: 'visible', timeout: 15000 });
  await docNav.click({ force: true });
  await window.waitForTimeout(1500);
  console.log('drilled into doc; testids now:', JSON.stringify(
    (await listTestIds().catch(() => [])).filter((id) => id.startsWith('helper-pane-'))
  ));

  // Drill into the nilable `meta` record field via its navigation arrow.
  const metaNav = frame.locator('[data-testid="helper-pane-nav-meta"]').first();
  await metaNav.waitFor({ state: 'visible', timeout: 15000 });
  await metaNav.click({ force: true });
  await window.waitForTimeout(1500);
  console.log('drilled into meta; testids now:', JSON.stringify(
    (await listTestIds().catch(() => [])).filter((id) => id.startsWith('helper-pane-'))
  ));

  // Click the `documentId` field to insert it. Because `meta` is nilable, the
  // access to its field must use `?.` — the whole point of the fix.
  const docIdField = frame.locator('[data-testid="helper-pane-item-documentId"]').first();
  await docIdField.waitFor({ state: 'visible', timeout: 15000 });
  await docIdField.click({ force: true });
  await window.waitForTimeout(1500);

  // The Expression editor should now hold `doc.meta?.documentId`.
  const deadline = Date.now() + 15000;
  let exprText = '';
  while (Date.now() < deadline) {
    exprText = (await frame.locator('[data-testid="side-panel"] .cm-content').last().innerText().catch(() => '')).replace(/\s+/g, '');
    if (exprText.includes('doc.meta?.documentId')) break;
    await window.waitForTimeout(500);
  }
  console.log('expression editor value:', exprText);
  if (!exprText.includes('doc.meta?.documentId')) {
    throw new Error(`expression editor did not build optional field access; got: "${exprText}" (expected doc.meta?.documentId)`);
  }
  if (/meta\.documentId/.test(exprText)) {
    throw new Error(`expression editor used plain access meta.documentId (regression): "${exprText}"`);
  }
  console.log('helper pane built optional field access: doc.meta?.documentId');

  await saveOpenFlowNodeForm();

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const automationBal = path.join(state.integrationDir, 'automation.bal');
  const srcDeadline = Date.now() + 30000;
  let source = '';
  while (Date.now() < srcDeadline) {
    source = fs.existsSync(automationBal) ? fs.readFileSync(automationBal, 'utf8') : '';
    if (source.includes('doc.meta?.documentId')) break;
    await window.waitForTimeout(1000);
  }
  if (!source.includes('doc.meta?.documentId')) {
    throw new Error(`automation.bal missing 'doc.meta?.documentId':\n${source}`);
  }
  if (source.includes('doc.meta.documentId')) {
    throw new Error(`automation.bal contains a plain 'meta.documentId' access (regression):\n${source}`);
  }
  console.log('automation.bal verified: string? docId = doc.meta?.documentId');
}
