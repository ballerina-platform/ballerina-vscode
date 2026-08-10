{
  // Execute the request cell, then verify the response via a direct probe
  // (the Hurl client output renders in a sandboxed iframe Playwright can't
  // read reliably) — same approach as http-try-it step 05.
  await ensureWorkbench();

  const cellEditor = window.locator('.cell.code .monaco-editor').first();
  await cellEditor.click({ force: true }).catch(() => {});
  await window.waitForTimeout(500);
  await window.keyboard.press('Control+Enter');

  const success = window.locator('.codicon-notebook-state-success').first();
  await success.waitFor({ state: 'visible', timeout: 30000 });
  console.log('notebook cell executed successfully');

  const result = await waitForEndpoint('http://localhost:9090/greeting', 30000, { method: 'GET' });
  if (result.status !== 200) throw new Error('unexpected status: ' + JSON.stringify(result));
  if (!result.body.includes('Hello, Ballerina!')) throw new Error('unexpected body: ' + result.body);
  console.log('response verified: status=' + result.status + ' body=' + result.body);
}
