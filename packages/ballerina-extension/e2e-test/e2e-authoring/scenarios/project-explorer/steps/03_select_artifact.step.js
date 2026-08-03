{
  const sideBar = window.locator('#workbench\\.parts\\.sidebar');
  const httpItem = sideBar.locator('div[role="treeitem"][aria-label^="HTTP Service - /foo"]').first();
  await httpItem.waitFor({ timeout: 10000 });
  await httpItem.click();
  await window.waitForTimeout(2000);
  const frame = await getBIWebview();
  await frame.getByRole('heading', { name: 'HTTP Service' }).waitFor({ timeout: 15000 });
  await frame.getByText('bar', { exact: true }).first().waitFor({ timeout: 15000 });
  console.log('HTTP service designer opened from tree selection');
}
