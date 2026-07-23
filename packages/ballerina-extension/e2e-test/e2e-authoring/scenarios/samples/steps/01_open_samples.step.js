{
  await openIntegratorActivity();

  const sideBar = window.locator('#workbench\\.parts\\.sidebar');
  const getStarted = sideBar.getByRole('button', { name: 'Get Started' }).first();
  await getStarted.waitFor({ state: 'visible', timeout: 120000 });
  await getStarted.click();

  const welcome = await waitForGuest('Welcome', 60000);
  await welcome.getByRole('heading', { name: 'WSO2 Integrator' }).waitFor({ timeout: 60000 });
  console.log('Welcome view loaded');

  await guestClick(welcome.getByRole('button', { name: 'Explore', exact: true }));

  const samples = await waitForGuest('Welcome', 60000);
  await samples.getByRole('heading', { name: 'Browse Samples' }).waitFor({ timeout: 60000 });
  console.log('Samples view loaded');

  const snap = await snapshot();
  const match = snap.match(/(\d+) results/);
  if (!match) throw new Error(`could not find a results count in the samples view:\n${snap}`);
  globalThis.initialSampleCount = Number(match[1]);
  console.log(`initial sample count: ${globalThis.initialSampleCount}`);

  console.log('done: 01_open_samples');
}
