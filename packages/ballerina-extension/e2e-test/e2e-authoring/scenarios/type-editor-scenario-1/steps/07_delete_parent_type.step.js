{
  const frame = await getBIWebview();

  // Open the three-dots menu on the parent node (Order) and choose Delete
  const menuBtn = frame.locator('[data-testid="type-node-Order-menu"]');
  await menuBtn.waitFor({ state: 'visible', timeout: 15000 });
  await menuBtn.click();
  const deleteItem = frame.getByText('Delete', { exact: true });
  await deleteItem.waitFor({ state: 'visible', timeout: 10000 });
  await deleteItem.click({ force: true });
  console.log('clicked Delete in node menu');

  // Confirmation dialog: "Are you sure you want to delete Order?"
  const confirmBtn = frame.getByRole('button', { name: 'Delete', exact: true });
  await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
  await confirmBtn.click({ force: true });
  console.log('confirmed deletion');

  await frame.locator('[data-testid="type-node-Order"]').waitFor({ state: 'detached', timeout: 30000 });
  console.log('Order node removed from diagram');

  // Verify source no longer contains the deleted type
  const source = await waitForTypesBalContent((s) => !s.includes('Order'));
  if (source.includes('Order')) throw new Error('types.bal still contains Order after delete:\n' + source);
  if (!source.includes('type Customer record')) throw new Error('types.bal missing Customer record after delete:\n' + source);
  if (!source.includes('type Location record')) throw new Error('types.bal missing Location record after delete:\n' + source);
  console.log('types.bal verified: Order deleted, Customer and Location remain');
}
