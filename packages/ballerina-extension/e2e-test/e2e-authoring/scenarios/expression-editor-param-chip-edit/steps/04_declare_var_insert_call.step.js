{
  await selectFlowNode('Declare Variable', 'Statement');
  const frame = await getBIWebview();
  const form = new Form(window, BI_INTEGRATOR_LABEL, frame);
  await form.switchToFormView(false, frame);
  await form.fill({
    values: {
      'Name*Name of the variable': { type: 'input', value: 'fullName' },
      'Type': { type: 'textarea', value: 'string', additionalProps: { clickLabel: true } }
    }
  });
  await dismissHelperPanel();
  console.log('declare-variable form: name=fullName, type=string');

  // Focus the "Initialize with value" expression field and insert a call to
  // getFullName(...) via the helper pane's Functions section (not typed +
  // autocompleted - the multi-mode chip editor's function-call insertion goes
  // through the same helper-pane path this exercises: newValue.endsWith('()')
  // triggers extractArgsFromFunction, producing $1/$2 placeholder chips).
  const exprCm = frame.locator('.cm-content').last();
  await exprCm.click({ force: true });
  await window.waitForTimeout(800);
  await frame.getByText('Functions', { exact: true }).first().click({ force: true });
  await window.waitForTimeout(800);
  const search = frame.getByRole('textbox', { name: 'Text field' }).last();
  await search.click({ force: true });
  await search.fill('getFullName');
  await window.waitForTimeout(1200);
  await frame.getByText('getFullName()', { exact: true }).first().click({ force: true });
  await window.waitForTimeout(1200);

  let content = await frame.evaluate(() => {
    const els = document.querySelectorAll('.cm-content');
    return els[els.length - 1].textContent;
  });
  if (!/^getFullName\(.*,.*\)$/.test(content)) {
    throw new Error(`function call not inserted as expected: ${JSON.stringify(content)}`);
  }
  console.log('function call inserted with placeholder chips:', JSON.stringify(content));

  // Click the first (still-a-chip) parameter placeholder and type a value
  // containing a space - this is the exact shape of the original bug: typing
  // a space used to trigger a background token refresh that could blank out
  // or corrupt the sibling (still-unfilled) placeholder chip.
  const firstChip = exprCm.locator('[data-chip-widget]').nth(0);
  await firstChip.click({ force: true });
  await window.waitForTimeout(500);
  await window.keyboard.type('"first name"', { delay: 60 });
  await window.waitForTimeout(800);

  content = await frame.evaluate(() => document.querySelectorAll('.cm-content')[document.querySelectorAll('.cm-content').length - 1].textContent);
  if (content !== 'getFullName("first name",  )') {
    throw new Error(`typed value did not land correctly inside the first param box, or the sibling placeholder was corrupted: ${JSON.stringify(content)}`);
  }
  console.log('typed "first name" landed fully inside the first param box; sibling placeholder untouched');

  // While the chip is still in edit mode, Backspace should delete a single
  // trailing character like normal text editing - not yank the whole chip,
  // which is the behavior for Backspace next to a chip that ISN'T being edited.
  // The cursor sits right after the closing quote that was just typed, so the
  // character Backspace removes is that closing quote, not the last letter.
  await window.keyboard.press('Backspace');
  await window.waitForTimeout(400);

  content = await frame.evaluate(() => document.querySelectorAll('.cm-content')[document.querySelectorAll('.cm-content').length - 1].textContent);
  if (content !== 'getFullName("first name,  )') {
    throw new Error(`Backspace while editing a chip should delete one character, not the whole chip: ${JSON.stringify(content)}`);
  }
  console.log('Backspace during edit removed a single character from the active chip');

  // Restore the deleted character before continuing.
  await window.keyboard.type('"', { delay: 60 });
  await window.waitForTimeout(400);

  content = await frame.evaluate(() => document.querySelectorAll('.cm-content')[document.querySelectorAll('.cm-content').length - 1].textContent);
  if (content !== 'getFullName("first name",  )') {
    throw new Error(`restoring the deleted character failed: ${JSON.stringify(content)}`);
  }

  // Commit with Enter - the chip should re-collapse showing the finished
  // value as ONE chip (not left as raw editable text, not split in two).
  await window.keyboard.press('Enter');
  await window.waitForTimeout(1000);

  const afterEnter = await frame.evaluate(() => {
    const els = document.querySelectorAll('.cm-content');
    const el = els[els.length - 1];
    return {
      text: el.textContent,
      chips: Array.from(el.querySelectorAll('[data-chip-widget]')).map((c) => c.textContent.trim())
    };
  });
  if (afterEnter.text !== 'getFullName("first name",  )' || afterEnter.chips.length !== 2 || afterEnter.chips[0] !== '"first name"') {
    throw new Error(`chip did not re-collapse correctly after Enter: ${JSON.stringify(afterEnter)}`);
  }
  console.log('first param chip committed via Enter and re-collapsed correctly:', JSON.stringify(afterEnter));
}
