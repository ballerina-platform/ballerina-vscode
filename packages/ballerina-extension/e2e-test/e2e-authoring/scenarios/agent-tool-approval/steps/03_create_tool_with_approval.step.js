{
  // Flow: create a tool with a new approval function (Create Custom Tool form).
  await openAddToolPanel();
  let frame = await getBIWebview();
  await clickVisibleText(frame, 'Create Custom Tool');
  await frame.getByRole('textbox', { name: /^Name\*Name of the agent tool/ }).waitFor({ timeout: 60000 });
  await frame.getByRole('textbox', { name: /^Name\*Name of the agent tool/ }).fill('sendEmail');
  await addToolParameter('string', 'to');
  await addToolParameter('string', 'subject');

  await addApprovalFunction();
  frame = await getBIWebview();
  const attached = await frame.locator('[data-testid="approval-function-attached"]').innerText();
  if (!attached.includes('sendEmailApproval')) throw new Error(`unexpected default name: ${attached}`);

  await frame.getByRole('button', { name: 'Create Tool' }).click();
  await frame.locator('[data-testid="agent-tool-sendEmail"]').waitFor({ timeout: 120000 });

  const source = collapseWhitespace(await waitForSources(
    (src) => src.includes('function sendEmailApproval'), 'sendEmailApproval generated'));
  for (const expected of [
    '@ai:AgentTool { requiresApproval: sendEmailApproval }',
    'isolated function sendEmailApproval(string to, string subject) returns boolean',
  ]) {
    if (!source.includes(expected)) throw new Error(`missing in source: ${expected}`);
  }
  console.log('created sendEmail with sendEmailApproval');
}
