{
  const frame = await getBIWebview();
  // Reuses the search filter left in place by step 03, which already
  // asserted this resolves to exactly one card.
  const card = frame.getByRole('article').filter({ hasText: 'Hello World Service' });
  await guestClick(card.getByRole('button', { name: 'Use this' }));

  // "Use this" triggers window.showOpenDialog for the download directory.
  // The harness renders this as VS Code's in-workbench simple file dialog
  // (files.simpleDialog.enable), not a native OS picker, so it is reachable
  // through the host page rather than the sample-view webview. It defaults
  // to the current workspace folder, which is fine for this scenario.
  const selectFolderButton = window.getByRole('button', { name: 'Select Folder' });
  await selectFolderButton.waitFor({ state: 'visible', timeout: 20000 });
  await selectFolderButton.click();
  console.log('confirmed sample download directory');

  // Wait for the download+extract to finish, then choose "New Window" on the
  // "Where would you like to open the project?" prompt.
  const newWindowButton = window.getByRole('button', { name: 'New Window' });
  await newWindowButton.waitFor({ state: 'visible', timeout: 60000 });
  await newWindowButton.click();
  console.log('sample downloaded; opening in a new window');

  // A brand-new Electron window opens for the extracted sample project.
  // Playwright's firstWindow() only fires for the very first window, so
  // ensureWorkbench()/waitForGuest() pick up the newest open window instead.
  window = null;
  const projectFrame = await waitForGuest(BI_INTEGRATOR_LABEL, 120000);
  await waitForText('Add Artifact', 60000);
  const snap = await snapshot();
  if (!snap.includes('hello-world-service') && !snap.includes('Add Artifact')) {
    throw new Error(`integration/project overview did not appear after opening the sample:\n${snap}`);
  }
  console.log('sample loaded; integration overview is visible');

  console.log('done: 04_use_sample');
}
