{
  // Flow: add an approval function on the edit page; the inline form creates it on save.
  await openToolEditForm('sendEmail');
  let frame = await getBIWebview();
  // The edit page opens the add form inline, not as a panel over the side panel.
  await frame.locator('#approval-function-add').click();
  await frame.getByText('New Approval Function', { exact: true }).waitFor({ timeout: 15000 });
  const rows = await frame.locator('[data-testid="approval-function-param"]').allTextContents();
  if (rows.join('|') !== 'stringto|stringsubject|stringcc') throw new Error(`unexpected mirrored parameters: ${rows}`);
  // Keep the suggested name; Add is enabled once the language server has checked it.
  await frame.locator('#approval-function-add-confirm vscode-button:not([disabled])').waitFor({ timeout: 20000 });
  await frame.locator('#approval-function-add-confirm').click();
  await frame.locator('[data-testid="approval-function-attached"]').waitFor({ timeout: 20000 });
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  await waitForSources((src) => collapseWhitespace(src).includes('@ai:AgentTool { requiresApproval: sendEmailApproval }')
    && collapseWhitespace(src).includes('isolated function sendEmailApproval(string to, string subject, string cc) returns boolean'),
  'sendEmailApproval attached and generated');
  console.log('added sendEmailApproval while editing');
}
