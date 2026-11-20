{
  // Flow: Remove detaches the approval function; on save the tool requires approval for every call and the
  // now unused function is deleted.
  await openToolEditForm('sendEmail');
  const frame = await getBIWebview();
  await frame.locator('[data-testid="approval-function-remove"]').click();
  await frame.locator('#approval-function-add').waitFor({ timeout: 15000 });
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  await waitForSources((src) => collapseWhitespace(src).includes('@ai:AgentTool { requiresApproval: true }')
    && !src.includes('function sendEmailApproval'), 'requiresApproval: true and sendEmailApproval deleted');
  console.log('removed: requiresApproval true, sendEmailApproval deleted');
}
