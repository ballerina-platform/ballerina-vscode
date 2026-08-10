{
  const frame = await getBIWebview();

  // Open Focused View from the remaining type's three-dots menu
  const menuBtn = frame.locator('[data-testid="type-node-Customer-menu"]');
  await menuBtn.waitFor({ state: 'visible', timeout: 15000 });
  await menuBtn.click();
  const focusItem = frame.getByText('Focused View', { exact: true });
  await focusItem.waitFor({ state: 'visible', timeout: 10000 });
  await focusItem.click({ force: true });
  console.log('clicked Focused View on Customer');

  // Only the focused type should be rendered in the diagram (the project
  // explorer tree still lists all types — this check is diagram-only)
  await frame.locator('[data-testid="type-node-Customer"]').waitFor({ timeout: 30000 });
  const deadline = Date.now() + 15000;
  let locationCount = 1;
  while (Date.now() < deadline) {
    locationCount = await frame.locator('[data-testid="type-node-Location"]').count();
    if (locationCount === 0) break;
    await window.waitForTimeout(500);
  }
  if (locationCount !== 0) throw new Error('Location node still visible in focused view');
  console.log('focused view shows only Customer (Location not rendered)');
}
