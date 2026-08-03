{
  // From the type diagram, the top-nav home button returns to the overview.
  const frame = await getBIWebview();
  if (!(await snapshot().catch(() => '')).includes('Add Artifact')) {
    const home = frame.locator('[data-testid="home-button"]').first();
    await home.waitFor({ state: 'visible', timeout: 15000 });
    await home.click({ force: true });
    console.log('clicked home button');
    await waitForText('Add Artifact', 60000);
  }
  console.log('on integration overview');

  await addAutomationArtifact();
  console.log('automation created — flow diagram visible');
}
