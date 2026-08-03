{
  await ensureWorkbench();

  // Navigate to the type diagram via the project explorer "Types" inline action
  // (the tree row itself has no click command — proven in type-editor scenarios).
  const sidebar = window.locator('#workbench\\.parts\\.sidebar');
  const typesItem = sidebar.locator(
    'div[role="treeitem"][aria-label="Types"], div[role="treeitem"][aria-label^="Types, "]'
  ).first();
  await typesItem.waitFor({ state: 'visible', timeout: 30000 });
  await typesItem.hover();
  const viewDiagram = typesItem.locator('a.action-label[aria-label*="View Type Diagram"]').first();
  await viewDiagram.waitFor({ state: 'visible', timeout: 10000 });
  await viewDiagram.click();
  console.log('clicked "View Type Diagram"');

  await window.waitForTimeout(3000);
  const frame = await getBIWebview();
  const addTypeBtn = frame.getByRole('button', { name: 'Add Type' });
  await addTypeBtn.waitFor({ state: 'visible', timeout: 30000 });
  await addTypeBtn.click({ force: true });
  console.log('clicked Add Type');
  await window.waitForTimeout(2000);

  const nameInput = frame.getByRole('textbox', { name: 'Name' }).first();
  await nameInput.waitFor({ state: 'visible', timeout: 15000 });
  await nameInput.fill('Person');
  console.log('filled type name: Person');

  // Field 1: "name" with the default type (string)
  const addFieldBtn = frame.locator('[data-testid="add-field-button"]');
  await addFieldBtn.waitFor({ state: 'visible', timeout: 15000 });
  await addFieldBtn.click();
  let idField = frame.locator('[data-testid="identifier-field"]').last();
  await idField.dblclick();
  await idField.type('name');
  console.log('added field: name (default type)');

  // Field 2: "age" — discover the type cell so we can set it to int
  await addFieldBtn.click();
  idField = frame.locator('[data-testid="identifier-field"]').last();
  await idField.dblclick();
  await idField.type('age');
  console.log('added field: age');
  console.log('testids now:', JSON.stringify(await listTestIds().catch(() => [])));

  // Edit the age field's type to int via the type cell + helper panel. Retry
  // the dblclick until the popup appears (isVisible() with no timeout is a
  // correct instant check here — the loop itself provides the real retry
  // cadence), then hard-fail via the unconditional waitFor below rather than
  // silently leaving age at its default type if the cell is momentarily slow
  // to render.
  const typeCell = frame.locator('[data-testid="type-field"]').last();
  const intOption = frame.locator('.unq-modal-overlay').getByText('int', { exact: true }).last();
  const typePopupDeadline = Date.now() + 30000;
  while (Date.now() < typePopupDeadline) {
    await typeCell.dblclick({ timeout: 5000 }).catch(() => {});
    if (await intOption.isVisible().catch(() => false)) break;
  }
  console.log('after type-cell dblclick snapshot:\n' + (await snapshot('int|string|Primitive').catch(() => '')));
  await intOption.waitFor({ state: 'visible', timeout: 5000 });
  await intOption.click({ force: true });
  console.log('selected int for age');

  // Mark age as optional — the "?" icon button next to the field
  // (vscode-button[title="Set as an Optional Field"]); active state flips the
  // icon fill from descriptionForeground to button-background.
  const optionalBtn = frame.locator('vscode-button[title="Set as an Optional Field"]').last();
  await optionalBtn.waitFor({ state: 'visible', timeout: 10000 });
  await optionalBtn.click({ force: true });
  await window.waitForTimeout(500);
  const activeFill = await optionalBtn.locator('g[fill="var(--vscode-button-background)"]').count();
  if (activeFill === 0) {
    throw new Error('optional-field "?" button did not activate for age');
  }
  console.log('marked age as optional (? icon active)');

  const saveBtn = frame.getByRole('button', { name: 'Save' }).first();
  await saveBtn.waitFor({ state: 'visible', timeout: 15000 });
  await saveBtn.click({ force: true });
  console.log('clicked Save');

  const typeNode = frame.locator('[data-testid="type-node-Person"]');
  await typeNode.waitFor({ timeout: 30000 });
  console.log('type-node-Person visible in diagram');

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const typesBal = path.join(state.integrationDir, 'types.bal');
  const typesSource = fs.readFileSync(typesBal, 'utf8');
  if (!typesSource.includes('string name;')) {
    throw new Error(`types.bal missing 'string name;':\n${typesSource}`);
  }
  if (!typesSource.includes('int age?;')) {
    throw new Error(`types.bal missing 'int age?;':\n${typesSource}`);
  }
  console.log('types.bal verified (name: string, age: int?)');
}
