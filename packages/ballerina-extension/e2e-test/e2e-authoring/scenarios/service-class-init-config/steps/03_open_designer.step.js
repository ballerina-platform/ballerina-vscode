{
  const frame = await getBIWebview();

  // Open the node's three-dot menu and click Edit. The popover can close on its
  // own while the diagram re-renders, so drive open+click as one retryable unit.
  const menuButton = frame.locator('[data-testid="type-node-Greeter-menu"]');
  const menuItem = frame.locator('#menu-item-edit');
  const methodButton = frame.getByRole('button', { name: ' Method' });

  for (let attempt = 0; attempt < 5; attempt++) {
    await menuButton.waitFor({ state: 'visible', timeout: 30000 });
    const icon = menuButton.getByRole('img');
    const target = (await icon.count()) > 0 ? icon.first() : menuButton;
    await target.click({ force: true });
    const clicked = await menuItem.waitFor({ state: 'visible', timeout: 5000 })
      .then(() => menuItem.click({ force: true, timeout: 5000 })).then(() => true).catch(() => false);
    if (clicked && await methodButton.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)) break;
    await window.waitForTimeout(1000);
  }
  await methodButton.waitFor({ state: 'visible', timeout: 30000 });
  console.log('service class designer open');
}
