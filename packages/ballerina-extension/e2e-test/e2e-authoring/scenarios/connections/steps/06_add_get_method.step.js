{
  const frame = await getBIWebview();
  const panel = frame.locator('[data-testid="side-panel"]').first();
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const connectionName = state.httpConnectionName;

  const clientEntryVisible = await panel.getByText(connectionName, { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (!clientEntryVisible) {
    await clickNextDiagramPlus();
  }
  await panel.getByText(connectionName, { exact: false }).first().click({ force: true });
  await window.waitForTimeout(2500);
  await panel.getByText('Get', { exact: true }).first().click({ force: true });
  await window.waitForTimeout(3000);
  console.log('opened Get action form for the http client');

  // Path is a CodeMirror expression editor, not a plain textbox.
  await cmFill('/', 0);

  // Target Type is a required autocomplete field with no default value;
  // type a concrete type and let the suggestion populate the input.
  const targetType = frame.locator('input[name="targetType"], textarea[name="targetType"]');
  await targetType.waitFor({ state: 'attached', timeout: 30000 });
  await targetType.evaluate((el) => el.scrollIntoView());
  await targetType.click({ force: true });
  await window.keyboard.type('http:Response', { delay: 20 });
  await window.waitForTimeout(1000);

  await dismissHelperPanel();
  const saveBtn = frame.getByRole('button', { name: 'Save' }).last();
  await saveBtn.waitFor({ state: 'visible', timeout: 15000 });
  if (!(await saveBtn.isEnabled().catch(() => false))) {
    throw new Error('Save is disabled after filling the Get form');
  }
  await saveBtn.click({ force: true });
  console.log('clicked Save on the Get action form');

  await frame.locator('[data-testid="bi-diagram-canvas"], #bi-diagram-canvas').waitFor({ timeout: 60000 });
  await frame.getByText(new RegExp(`${connectionName}.*get`)).first().waitFor({ timeout: 15000 });
  console.log('http get node is shown in the connection');

  const deadline = Date.now() + 30000;
  let source = '';
  while (Date.now() < deadline) {
    source = fs.readFileSync(path.join(state.integrationDir, 'automation.bal'), 'utf8');
    if (source.includes(`${connectionName}->get`)) break;
    await window.waitForTimeout(1000);
  }
  if (!source.includes(`${connectionName}->get`)) {
    throw new Error(`automation.bal missing get call:\n${source}`);
  }
  console.log(`automation.bal contains ${connectionName}->get(...)`);
}
