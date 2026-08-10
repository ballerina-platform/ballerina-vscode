{
  await ensureWorkbench();

  // The "Types" category node has no click command — navigation happens via
  // its inline actions ("View Type Diagram" / "Add Type"). Hover to reveal them.
  const sidebar = window.locator('#workbench\\.parts\\.sidebar');
  const typesItem = sidebar.locator(
    'div[role="treeitem"][aria-label="Types"], div[role="treeitem"][aria-label^="Types, "]'
  ).first();
  await typesItem.waitFor({ state: 'visible', timeout: 15000 });
  await typesItem.hover();

  const actions = await typesItem.locator('a.action-label').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label'))
  );
  console.log('Types inline actions:', JSON.stringify(actions));

  const viewDiagram = typesItem.locator('a.action-label[aria-label*="View Type Diagram"]').first();
  await viewDiagram.waitFor({ state: 'visible', timeout: 10000 });
  await viewDiagram.click();
  console.log('clicked "View Type Diagram" inline action');

  // Verify the type diagram view is shown in the webview
  await window.waitForTimeout(3000);
  const frame = await getBIWebview();
  console.log('webview snapshot after View Type Diagram:\n' + (await snapshot().catch((e) => 'snapshot err: ' + e.message)));
  console.log('testids:', JSON.stringify(await listTestIds().catch(() => [])));
  const addTypeBtn = frame.getByRole('button', { name: 'Add Type' });
  await addTypeBtn.waitFor({ state: 'visible', timeout: 30000 });
  console.log('type diagram view visible (Add Type button present)');
}
