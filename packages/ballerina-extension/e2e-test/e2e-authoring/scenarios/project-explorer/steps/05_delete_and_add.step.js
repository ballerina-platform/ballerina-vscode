{
  const sideBar = window.locator('#workbench\\.parts\\.sidebar');
  const treeItem = (label) => sideBar.locator(
    `div[role="treeitem"][aria-label="${label}"], div[role="treeitem"][aria-label^="${label}, "]`
  ).first();

  const mainItem = treeItem('main');
  await mainItem.waitFor({ timeout: 10000 });
  await mainItem.click({ button: 'right' });
  await window.waitForTimeout(800);
  const deleteBtn = window.getByRole('button', { name: 'Delete' }).first();
  await deleteBtn.waitFor({ timeout: 5000 });
  await deleteBtn.click();
  await window.waitForTimeout(1500);
  const stillVisibleAfterDelete = await mainItem.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false);
  if (stillVisibleAfterDelete) throw new Error('main was not removed from the tree');

  const entryPoints = treeItem('Entry Points');
  await entryPoints.hover();
  await window.waitForTimeout(500);
  const addBtn = sideBar.getByRole('button', { name: 'Add Entry Point' }).first();
  await addBtn.waitFor({ timeout: 10000 });
  await addBtn.click();
  await window.waitForTimeout(1500);

  const frame = await getBIWebview();
  const automationCard = frame.locator('[data-testid="automation"], #automation').first();
  await automationCard.waitFor({ timeout: 10000 });
  await automationCard.click({ force: true });
  await window.waitForTimeout(1000);
  await frame.getByRole('button', { name: 'Create' }).click({ force: true });
  await frame.locator('[data-testid="bi-diagram-canvas"], #bi-diagram-canvas').first().waitFor({ timeout: 30000 });
  await window.waitForTimeout(1500);

  const reAppeared = await mainItem.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!reAppeared) throw new Error('main was not re-added to the tree via "Add Entry Point"');
  console.log('Delete + Add Entry Point round-trip verified');
}
