globalThis.openIntegratorActivity = async () => {
  await ensureWorkbench();
  const activity = window.locator(
    `#workbench\\.parts\\.activitybar a.action-label[aria-label="${BI_INTEGRATOR_LABEL}"]`
  ).first();
  await activity.waitFor({ state: 'visible', timeout: 120000 });
  await activity.click();
};

globalThis.createProjectAndIntegration = async (baseName = 'Authoring') => {
  const suffix = Date.now();
  const projectName = `${baseName}Project${suffix}`;
  const integrationName = `${baseName}Integration${suffix}`;
  await openIntegratorActivity();

  const sideBar = window.locator('#workbench\\.parts\\.sidebar');
  const getStarted = sideBar.getByRole('button', { name: 'Get Started' }).first();
  try {
    await getStarted.waitFor({ state: 'visible', timeout: 120000 });
    await getStarted.click();
  } catch (error) {
    const host = await hostSnapshot().catch(() => '');
    throw new Error(`Get Started button was not available in the WSO2 Integrator side panel: ${error.message}\n${host}`);
  }

  let frame = await waitForGuest('Welcome', 60000).catch(() => waitForGuest(BI_INTEGRATOR_LABEL, 60000));
  const createHeading = frame.getByRole('heading', { name: 'Create New Integration' });
  if (await createHeading.isVisible({ timeout: 10000 }).catch(() => false)) {
    await frame.getByRole('button', { name: 'Create' }).first().click();
  }

  frame = await waitForGuest('Welcome', 30000).catch(() => waitForGuest(BI_INTEGRATOR_LABEL, 30000));
  await frame.getByRole('textbox', { name: /Integration Name/i }).fill(integrationName);
  await frame.getByRole('textbox', { name: /Project Name/i }).fill(projectName);

  const projectPathInput = frame.getByRole('textbox', { name: /Select Path/i })
    .or(frame.locator('input#project-folder-selector-input'));
  if (await projectPathInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await projectPathInput.first().fill(dataFolder);
  }

  await frame.getByRole('button', { name: 'Create Integration' }).click({ force: true });
  frame = await waitForGuest(BI_INTEGRATOR_LABEL, 120000);
  // Two landing flows exist: older builds land on the project overview (click
  // the integration name to open it), newer builds land directly on the
  // integration overview ('Add Artifact' already visible). Poll for either.
  const deadline = Date.now() + 120000;
  let landed = false;
  while (Date.now() < deadline) {
    const current = await snapshot().catch(() => '');
    if (current.includes('Add Artifact')) { landed = true; break; }
    if (current.includes(integrationName)) {
      await frame.getByText(integrationName, { exact: true }).first().click({ force: true }).catch(() => {});
      await waitForText('Add Artifact', 60000);
      landed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!landed) throw new Error(`Integration overview did not load after Create Integration (${integrationName})`);
  // Resolve the created integration directory: newer builds create
  // data/<integration> directly; older ones data/<project>/<integration>.
  // Poll briefly since the directory can lag behind the UI landing.
  const candidates = [
    path.join(dataFolder, projectName.toLowerCase(), integrationName.toLowerCase()),
    path.join(dataFolder, integrationName.toLowerCase()),
  ];
  const dirDeadline = Date.now() + 30000;
  let integrationDir;
  while (Date.now() < dirDeadline) {
    integrationDir = candidates.find((dir) => fs.existsSync(dir));
    if (integrationDir) break;
    await window.waitForTimeout(500);
  }
  if (!integrationDir) throw new Error(`integration directory not found, tried: ${candidates.join(', ')}`);
  const projectDir = path.dirname(integrationDir);
  globalThis.newProjectPath = integrationDir;
  return { projectName, integrationName, projectDir, integrationDir };
};

globalThis.navigateToIntegrationOverview = async (integrationName) => {
  const frame = await getBIWebview();
  const existing = await snapshot().catch(() => '');
  if (existing.includes('Add Artifact') && existing.includes('Run')) return;
  await frame.getByText(integrationName, { exact: true }).first().click({ force: true }).catch(() => {});
  await waitForText('Add Artifact', 60000);
};
