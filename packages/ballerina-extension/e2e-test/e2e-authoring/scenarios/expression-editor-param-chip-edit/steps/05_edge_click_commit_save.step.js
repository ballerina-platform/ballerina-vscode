{
  const frame = await getBIWebview();
  const exprCm = frame.locator('.cm-content').last();

  // Click as close to the second chip's edge as possible (not dead center)
  // to exercise the boundary-click fallback - a click landing on the sliver
  // of plain text/gap right at a chip's boundary, rather than square on its
  // widget, used to fall through to plain cursor placement instead of
  // activating the chip.
  const secondChip = exprCm.locator('[data-chip-widget]').nth(1);
  const box = await secondChip.boundingBox();
  if (!box) throw new Error('second parameter chip not found');
  await window.mouse.click(box.x + 1, box.y + box.height / 2);
  await window.waitForTimeout(500);
  await window.keyboard.type('"last name"', { delay: 60 });
  await window.waitForTimeout(800);

  let content = await frame.evaluate(() => document.querySelectorAll('.cm-content')[document.querySelectorAll('.cm-content').length - 1].textContent);
  if (content !== 'getFullName("first name", "last name")') {
    throw new Error(`edge click did not activate the second param box correctly: ${JSON.stringify(content)}`);
  }
  console.log('edge click activated the second param box; typed value landed inside it:', JSON.stringify(content));

  // Commit by moving focus away (blur) instead of pressing Enter.
  const nameField = frame.getByRole('textbox', { name: /Name.*Name of the variable/i }).first();
  await nameField.click({ force: true });
  await window.waitForTimeout(1000);

  const afterBlur = await frame.evaluate(() => {
    const els = document.querySelectorAll('.cm-content');
    const el = els[els.length - 1];
    return {
      text: el.textContent,
      chips: Array.from(el.querySelectorAll('[data-chip-widget]')).map((c) => c.textContent.trim())
    };
  });
  if (
    afterBlur.text !== 'getFullName("first name", "last name")' ||
    afterBlur.chips.length !== 2 ||
    afterBlur.chips[0] !== '"first name"' ||
    afterBlur.chips[1] !== '"last name"'
  ) {
    throw new Error(`second param chip did not commit correctly on blur: ${JSON.stringify(afterBlur)}`);
  }
  console.log('second param chip committed via blur and re-collapsed correctly:', JSON.stringify(afterBlur));

  await saveOpenFlowNodeForm();
  await window.waitForTimeout(3000);

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const source = fs.readFileSync(path.join(state.integrationDir, 'automation.bal'), 'utf8');
  const expected = 'string fullName = getFullName("first name", "last name");';
  if (!source.includes(expected)) {
    throw new Error(`automation.bal missing the fully-correct call:\nexpected to include: ${expected}\n\n${source}`);
  }
  console.log('automation.bal verified:', expected);
}
