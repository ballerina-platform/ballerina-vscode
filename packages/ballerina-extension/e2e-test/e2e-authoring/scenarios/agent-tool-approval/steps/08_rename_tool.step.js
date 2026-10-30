{
  // Flow: renaming the tool keeps its approval function reference.
  await openToolEditForm('sendEmail');
  const frame = await getBIWebview();
  if (await frame.getByRole('button', { name: 'Cancel', exact: true }).count() > 1) {
    // Rename mode left open by an earlier attempt.
    await frame.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  }
  await frame.locator('vscode-button[title="Rename"]').click();
  await frame.getByText('Note: Renaming will update all references across the project').waitFor({ timeout: 15000 });
  await frame.getByRole('textbox', { name: /^Name\*Name of the agent tool/ }).fill('sendMail');
  // The first Save belongs to the rename controls; the page's own Save is further down.
  await frame.getByRole('button', { name: 'Save', exact: true }).first().click();
  await waitForSources((src) => {
    const flat = collapseWhitespace(src);
    return flat.includes('@ai:AgentTool { requiresApproval: sendEmailApproval } isolated function sendMail(')
      && flat.includes('tools = [sendMail]');
  }, 'tool renamed to sendMail with its approval function kept');
  console.log('renamed sendEmail to sendMail; requiresApproval still sendEmailApproval');
}
