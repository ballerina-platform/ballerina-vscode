{
  // Flow: deleting a tool also deletes its approval function.
  await openToolEditForm('sendMail');
  let frame = await getBIWebview();
  await addApprovalFunction();
  await frame.getByRole('button', { name: 'Save', exact: true }).last().click();
  await waitForSources((src) => collapseWhitespace(src)
    .includes('isolated function sendMailApproval(string to, string subject, string cc) returns boolean'),
  'sendMailApproval generated');

  await backToAgentView();
  frame = await getBIWebview();
  const tool = frame.locator('[data-testid="agent-tool-sendMail"]').first();
  await tool.dispatchEvent('contextmenu');
  await frame.locator('#menu-item-delete').click({ timeout: 10000 });
  await tool.waitFor({ state: 'detached', timeout: 120000 });
  await waitForSources((src) => !src.includes('function sendMail(') && !src.includes('sendMailApproval'),
    'tool and its approval function deleted');
  console.log('deleted sendMail and sendMailApproval');
}
