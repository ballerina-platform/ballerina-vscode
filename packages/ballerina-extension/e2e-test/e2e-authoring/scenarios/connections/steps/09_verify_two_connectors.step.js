{
  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'));

  let frame = await getBIWebview();
  const home = frame.locator('[data-testid="home-button"]');
  if (await home.isVisible({ timeout: 2000 }).catch(() => false)) {
    await home.click({ force: true });
  }
  await navigateToIntegrationOverview(state.integrationName);
  frame = await getBIWebview();

  const httpNode = frame.locator(`[data-testid="connection-node-${state.httpConnectionName}"]`);
  await httpNode.waitFor({ state: 'visible', timeout: 60000 });

  const petstoreNode = frame.locator('[data-testid^="connection-node-"]', { hasText: 'petstore' }).first();
  await petstoreNode.waitFor({ state: 'visible', timeout: 60000 });
  console.log('architecture diagram shows both the http client and the generated petstore connector');

  // The http client is referenced by the `->get(...)` call added earlier, so
  // the diagram engine creates a NodeLinkModel/visible link path for it; the
  // petstore connector is never referenced from any function and gets no
  // link. Count rendered link paths (excluding the wider invisible hit-test
  // "-bg" duplicate) to distinguish the two.
  const linkPaths = frame.locator('path[id]:not([id$="-bg"])');
  const linkCount = await linkPaths.count();
  if (linkCount !== 1) {
    throw new Error(`expected exactly 1 connector link (httpClient only), found ${linkCount}`);
  }
  console.log('verified exactly one connection line exists, for the referenced httpClient connector');
}
