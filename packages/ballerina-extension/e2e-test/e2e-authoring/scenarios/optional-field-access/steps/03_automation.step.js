{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));
  const frame = await getBIWebview();

  // Return to an overview. From the type diagram the top-nav home button goes
  // back; depending on the build it lands on either the integration overview
  // (shows "Add Artifact") or the project overview (shows the integration name
  // to click into).
  let snap = await snapshot().catch(() => '');
  if (!snap.includes('Add Artifact')) {
    const home = frame.locator('[data-testid="home-button"]').first();
    if (await home.isVisible({ timeout: 5000 }).catch(() => false)) {
      await home.click({ force: true });
      console.log('clicked home button');
      await window.waitForTimeout(3000);
      snap = await snapshot().catch(() => '');
    }
  }

  // If we landed on the project overview, open the integration to reach the
  // "Add Artifact" overview.
  if (!snap.includes('Add Artifact')) {
    await navigateToIntegrationOverview(state.integrationName);
  }
  await waitForText('Add Artifact', 60000);
  console.log('on integration overview');

  await addAutomationArtifact();
  console.log('automation created — flow diagram visible');
}
