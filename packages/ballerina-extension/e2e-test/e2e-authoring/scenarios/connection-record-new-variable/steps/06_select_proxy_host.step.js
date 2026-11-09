{
  const frame = await getBIWebview();
  const overlay = frame.locator('.unq-modal-overlay').last();
  const checkboxFor = (name) => overlay.locator(
    `xpath=//p[normalize-space(text())="${name}"]/preceding-sibling::vscode-checkbox[1]`
  ).first();

  await checkboxFor('proxy').waitFor({ timeout: 30000 });
  await checkboxFor('proxy').evaluate((el) => el.click());
  await window.waitForTimeout(2500);
  console.log('selected proxy');

  await checkboxFor('host').waitFor({ timeout: 30000 });
  await checkboxFor('host').evaluate((el) => el.click());
  await window.waitForTimeout(2500);
  const value = await overlay.locator('.cm-content').last().innerText();
  console.log('record expression:', JSON.stringify(value));
}
