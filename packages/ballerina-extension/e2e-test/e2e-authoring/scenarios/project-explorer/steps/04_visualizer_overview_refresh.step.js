{
  const sideBar = window.locator('#workbench\\.parts\\.sidebar');
  const schoolItem = sideBar.locator('div[role="treeitem"][aria-label^="School"]').first();
  await schoolItem.hover();
  await window.waitForTimeout(500);
  const vizBtn = sideBar.getByRole('button', { name: 'Show Visualizer' }).first();
  await vizBtn.waitFor({ timeout: 10000 });
  await vizBtn.click();
  await window.waitForTimeout(1500);
  let frame = await getBIWebview();
  await frame.getByRole('button', { name: /Add Artifact/i }).waitFor({ timeout: 15000 });
  console.log('Show Visualizer navigated to School overview');

  const openOverviewBtn = sideBar.getByRole('button', { name: 'Open Overview' }).first();
  await openOverviewBtn.click();
  await window.waitForTimeout(1500);
  frame = await getBIWebview();
  await frame.getByRole('heading', { name: 'Education' }).waitFor({ timeout: 15000 });
  console.log('Open Overview navigated to workspace overview');

  const refreshBtn = sideBar.getByRole('button', { name: 'Refresh' }).first();
  await refreshBtn.click();
  await window.waitForTimeout(1500);
  await sideBar.locator('div[role="treeitem"][aria-label^="School"]').first().waitFor({ timeout: 10000 });
  await sideBar.locator('div[role="treeitem"][aria-label^="Institutes"]').first().waitFor({ timeout: 10000 });
  console.log('Refresh reloaded tree with both packages still listed');
}
