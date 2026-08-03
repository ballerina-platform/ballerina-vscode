{
  const sideBar = window.locator('#workbench\\.parts\\.sidebar');
  const treeItem = (label) => sideBar.locator(
    `div[role="treeitem"][aria-label="${label}"], div[role="treeitem"][aria-label^="${label}, "]`
  ).first();

  const schoolItem = treeItem('School');
  await schoolItem.waitFor({ timeout: 10000 });
  await schoolItem.click();
  await window.waitForTimeout(1000);
  if ((await schoolItem.getAttribute('aria-expanded')) !== 'true') {
    throw new Error('School did not expand');
  }

  const entryPoints = treeItem('Entry Points');
  await entryPoints.waitFor({ timeout: 10000 });
  await entryPoints.click();
  await window.waitForTimeout(1000);
  if ((await entryPoints.getAttribute('aria-expanded')) !== 'false') {
    throw new Error('Entry Points did not collapse');
  }
  const mainHiddenAfterCollapse = !(await treeItem('main').isVisible().catch(() => false));

  await entryPoints.click();
  await window.waitForTimeout(1000);
  const expandedAgain = (await entryPoints.getAttribute('aria-expanded')) === 'true';

  console.log(JSON.stringify({ mainHiddenAfterCollapse, expandedAgain }));
}
