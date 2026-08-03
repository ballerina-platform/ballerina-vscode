{
  const frame = await getBIWebview();
  const panel = frame.locator('[data-testid="side-panel"]').first();

  // After saving the connection the node palette reopens with the client
  // listed under Connections. Open its Query action.
  const mysqlEntryVisible = await panel.getByText('mysqlClient', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (!mysqlEntryVisible) {
    await clickNextDiagramPlus();
  }
  await panel.getByText('mysqlClient', { exact: false }).first().click({ force: true });
  await window.waitForTimeout(2500);
  await panel.getByText('Query', { exact: true }).first().click({ force: true });
  await window.waitForTimeout(3000);

  // The SQL Query field has a SQL / Expression mode switcher
  const sqlMode = frame.locator('[data-testid="primary-mode"]').first();
  const exprMode = frame.locator('[data-testid="expression-mode"]').first();
  await sqlMode.waitFor({ state: 'visible', timeout: 15000 });
  const labels = [await sqlMode.innerText(), await exprMode.innerText()];
  console.log('mode labels:', JSON.stringify(labels));
  if (labels[0] !== 'SQL' || labels[1] !== 'Expression') {
    throw new Error(`unexpected query mode labels: ${JSON.stringify(labels)}`);
  }

  // Type the statement in SQL mode
  const cm = panel.locator('.cm-content').first();
  await cm.click({ force: true });
  await window.waitForTimeout(500);
  await window.keyboard.type('SELECT * FROM users', { delay: 30 });
  await window.waitForTimeout(2000);

  // Toggle to Expression: the value becomes a backtick template; toggle back:
  // the raw SQL returns. No errors in either direction. The mode switcher
  // labels can render outside the viewport at this window size, so use a
  // DOM click instead of a pointer click (consistent with steps 06-08 and
  // the downstream Playwright spec).
  await domClick(exprMode);
  await window.waitForTimeout(2000);
  const exprText = await panel.locator('.cm-content').first().innerText();
  if (!exprText.includes('`SELECT * FROM users`')) {
    throw new Error(`expression mode did not show backtick template: ${JSON.stringify(exprText)}`);
  }
  console.log('expression mode shows backtick template');
  await domClick(sqlMode);
  await window.waitForTimeout(2000);
  const sqlText = await panel.locator('.cm-content').first().innerText();
  if (sqlText.trim() !== 'SELECT * FROM users') {
    throw new Error(`sql mode did not restore raw statement: ${JSON.stringify(sqlText)}`);
  }
  console.log('sql mode restored raw statement');

  const save = panel.getByRole('button', { name: 'Save' }).last();
  if (!(await save.isEnabled().catch(() => false))) {
    throw new Error('Save is disabled after SQL/Expression mode toggling');
  }
  await dismissHelperPanel();
  await saveOpenFlowNodeForm();
  console.log('query node saved');

  // The diagram shows the connector action node; source has the call
  await frame.getByText(/query/).last().waitFor({ timeout: 15000 });
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const deadline = Date.now() + 30000;
  let source = '';
  while (Date.now() < deadline) {
    source = fs.readFileSync(path.join(state.integrationDir, 'automation.bal'), 'utf8');
    if (source.includes('mysqlClient->query(`SELECT * FROM users`)')) break;
    await window.waitForTimeout(1000);
  }
  if (!source.includes('mysqlClient->query(`SELECT * FROM users`)')) {
    throw new Error(`automation.bal missing query call:\n${source}`);
  }
  console.log('automation.bal contains mysqlClient->query(`SELECT * FROM users`)');
}
