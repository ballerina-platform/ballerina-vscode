{
  const frame = await getBIWebview();

  // Click the home button in the webview top navigation bar.
  // Selector gap: the IconButton has no data-testid/aria-label — only the
  // icon class fw-bi-home identifies it. Promoted spec must use a testid.
  const homeIcon = frame.locator('i.fw-bi-home');
  await homeIcon.waitFor({ state: 'visible', timeout: 15000 });
  await homeIcon.click({ force: true });
  console.log('clicked home button');
  recordSelectorGap('TopNavigationBar home IconButton has no stable selector', 'home-button');

  // Verify we are back on the integration overview (home view)
  await waitForText('Add Artifact', 30000);
  console.log('home/overview view visible (Add Artifact present)');

  // Click the "+" (Add Type) inline action on the Types node in the explorer
  const sidebar = window.locator('#workbench\\.parts\\.sidebar');
  const typesItem = sidebar.locator(
    'div[role="treeitem"][aria-label="Types"], div[role="treeitem"][aria-label^="Types, "]'
  ).first();
  await typesItem.waitFor({ state: 'visible', timeout: 15000 });
  await typesItem.hover();
  const addAction = typesItem.locator('a.action-label[aria-label*="Add Type"]').first();
  await addAction.waitFor({ state: 'visible', timeout: 10000 });
  await addAction.click();
  console.log('clicked "Add Type" inline action in explorer');

  // The type diagram should open with the New Type side panel already visible
  await window.waitForTimeout(3000);
  const frame2 = await getBIWebview();
  console.log('snapshot after explorer Add Type:\n' + (await snapshot().catch((e) => 'snapshot err: ' + e.message)));
  const panel = frame2.locator('[data-testid="type-editor-container"]');
  await panel.waitFor({ state: 'visible', timeout: 30000 });
  const nameInput = frame2.getByRole('textbox', { name: 'Name' }).first();
  await nameInput.waitFor({ state: 'visible', timeout: 15000 });
  console.log('New Type side panel open via explorer "+" action');
}
