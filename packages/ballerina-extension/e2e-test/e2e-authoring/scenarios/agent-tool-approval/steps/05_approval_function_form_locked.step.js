{
  // Flow: an approval function's parameters can't be edited in its own form.
  await openToolEditForm('sendEmail');
  let frame = await getBIWebview();
  await frame.locator('[data-testid="approval-function-open"]').click();
  // Open goes to the function's flow diagram.
  await frame.getByRole('heading', { name: 'Function' }).waitFor({ timeout: 60000 });
  await frame.getByText('sendEmailApproval', { exact: true }).first().waitFor({ timeout: 30000 });
  await frame.getByRole('button', { name: /Configure/ }).click();
  frame = await getBIWebview();
  await frame.getByText(/Approval function for sendEmail\./).waitFor({ timeout: 60000 });
  for (const param of ['to', 'subject', 'cc']) {
    await frame.locator(`[data-testid="${param}-item"]`).waitFor({ timeout: 15000 });
  }
  const editIcons = await frame.locator('.codicon-edit, .codicon-trash').count();
  if (editIcons !== 0) throw new Error(`parameters should be read-only, found ${editIcons} edit/delete icons`);
  await frame.locator('[data-testid="readonly-field-type"]').waitFor({ timeout: 15000 });
  console.log('approval function parameters and return type are read-only');
}
