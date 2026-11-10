{
  // Flow: turning Requires Approval off drops the field and deletes the now unused function.
  await openToolEditForm('sendMail');
  const frame = await getBIWebview();
  await frame.locator('[data-testid="approval-required"] vscode-checkbox').first().click();
  await frame.locator('[data-testid="approval-function-attached"]').waitFor({ state: 'hidden', timeout: 15000 });
  await frame.getByRole('button', { name: 'Save', exact: true }).last().click();
  await waitForSources((src) => !src.includes('requiresApproval') && !src.includes('function sendEmailApproval')
    && src.includes('function sendMail('), 'requiresApproval removed and sendEmailApproval deleted');
  console.log('approval off: field removed, sendEmailApproval deleted');
}
