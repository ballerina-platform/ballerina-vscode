{
  // Flow: edit a tool's parameters; the approval function follows on save.
  await openToolEditForm('sendEmail');
  await addToolParameter('string', 'cc');
  const frame = await getBIWebview();
  const note = frame.locator('[data-testid="approval-function-sync-note"]');
  await note.waitFor({ timeout: 15000 });
  const text = await note.innerText();
  if (!text.includes('sendEmailApproval will be updated to match when you save')) {
    throw new Error(`unexpected sync note: ${text}`);
  }
  await frame.getByRole('button', { name: 'Save', exact: true }).click();
  await waitForSources((src) => collapseWhitespace(src)
    .includes('isolated function sendEmailApproval(string to, string subject, string cc) returns boolean'),
  'sendEmailApproval synced with the new parameter');
  console.log('sendEmailApproval synced on save');
}
