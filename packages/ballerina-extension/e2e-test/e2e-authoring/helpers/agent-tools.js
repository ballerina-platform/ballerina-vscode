// Helpers for agent-tool scenarios: building a custom tool's parameters, the Requires Approval field, and
// reading the generated source.

// Opens the agent node's Add Tool panel. The control is an SVG group, which needs dispatched events.
globalThis.openAddToolPanel = async () => {
  const frame = await getBIWebview();
  for (let attempt = 0; attempt < 3; attempt++) {
    await diagramClick(frame.locator('[data-testid="agent-add-tool"]').first());
    if (await frame.getByText('Create Custom Tool', { exact: true }).last()
      .waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) {
      return;
    }
  }
  throw new Error('Add Tool panel did not open');
};

// Adds a parameter in the tool form's parameter list. The type box has no label of its own; it is the
// textbox right before the parameter's Name box.
globalThis.addToolParameter = async (type, name) => {
  const frame = await getBIWebview();
  const nameBox = frame.getByRole('textbox', { name: /^Name\*Name of the parameter/ });
  if (!await nameBox.isVisible().catch(() => false)) {
    await frame.locator('div:has(i.codicon-add) >> text=Add Parameter').first().click();
    await nameBox.waitFor({ timeout: 15000 });
  }
  const boxes = await frame.getByRole('textbox').all();
  let typeBox;
  for (let i = 1; i < boxes.length; i++) {
    const label = await boxes[i].evaluate((e) => e.closest('vscode-text-field')?.getAttribute('aria-label')
      || e.getAttribute('aria-label') || '');
    if (label.startsWith('Name*Name of the parameter')) {
      typeBox = boxes[i - 1];
      break;
    }
  }
  if (!typeBox) throw new Error('parameter type box not found');
  await typeBox.click();
  await window.keyboard.press('ControlOrMeta+A');
  await window.keyboard.insertText(type);
  await window.waitForTimeout(800);
  await window.keyboard.press('Escape');
  await nameBox.fill(name);
  const add = frame.getByRole('button', { name: 'Add', exact: true });
  for (let i = 0; i < 20 && await add.isDisabled(); i++) await window.waitForTimeout(300);
  await add.click();
  await nameBox.waitFor({ state: 'hidden', timeout: 15000 });
};

// Ticks Requires Approval (if it isn't already) and adds a new approval function through the field's own form.
globalThis.addApprovalFunction = async (name) => {
  const frame = await getBIWebview();
  const add = frame.locator('#approval-function-add');
  if (!await add.isVisible().catch(() => false)) {
    await frame.locator('[data-testid="approval-required"] vscode-checkbox').first().click();
    await add.waitFor({ timeout: 15000 });
  }
  await add.click();
  const nameBox = frame.locator('#approval-function-name');
  await nameBox.waitFor({ timeout: 15000 });
  if (name) {
    await frame.getByRole('textbox', { name: /^Function Name\*/ }).fill(name);
  }
  // A dispatched DOM click doesn't reach this toolkit button's handler; a real click does.
  await frame.locator('#approval-function-add-confirm').click();
  await frame.locator('[data-testid="approval-function-attached"]').waitFor({ timeout: 20000 });
};

// All .bal sources of the scenario's integration, concatenated.
globalThis.readIntegrationSources = () => {
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  return fs.readdirSync(state.integrationDir).filter((f) => f.endsWith('.bal'))
    .map((f) => fs.readFileSync(path.join(state.integrationDir, f), 'utf8')).join('\n');
};

// Waits until the integration's sources satisfy a predicate, so a check runs after the save is written.
globalThis.waitForSources = async (predicate, description, timeoutMs = 60000) => {
  const deadline = Date.now() + timeoutMs;
  let source = '';
  while (Date.now() < deadline) {
    source = readIntegrationSources();
    if (predicate(source)) return source;
    await window.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for source: ${description}\n${source}`);
};

globalThis.collapseWhitespace = (text) => text.replace(/\s+/g, ' ');

// Goes back to the agent's view (where tools are listed) using the title bar's back button.
globalThis.backToAgentView = async () => {
  const frame = await getBIWebview();
  for (let i = 0; i < 5; i++) {
    if (await frame.locator('[data-testid="agent-add-tool"]').isVisible().catch(() => false)) return;
    await frame.locator('[data-testid="back-button"]').first().click({ force: true });
    await window.waitForTimeout(2500);
  }
  await frame.locator('[data-testid="agent-add-tool"]').waitFor({ timeout: 60000 });
};

// Opens a tool's edit form from the agent node's tool menu.
globalThis.openToolEditForm = async (toolName) => {
  await backToAgentView();
  const frame = await getBIWebview();
  const tool = frame.locator(`[data-testid="agent-tool-${toolName}"]`).first();
  await tool.waitFor({ timeout: 60000 });
  await tool.dispatchEvent('contextmenu');
  await frame.locator('#menu-item-edit').click({ timeout: 10000 });
  await frame.getByRole('heading', { name: 'Agent Tool' }).waitFor({ timeout: 60000 });
};
