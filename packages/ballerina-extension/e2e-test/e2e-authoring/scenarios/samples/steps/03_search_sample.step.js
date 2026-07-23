{
  const frame = await getBIWebview();

  // Click "All" again to lift the type filter before searching.
  await guestClick(frame.getByRole('button', { name: 'All', exact: true }));
  await window.waitForTimeout(1000);

  const searchBox = frame.getByRole('textbox', { name: 'Text field' });
  await guestFill(searchBox, 'Hello World');
  await window.waitForTimeout(1000);

  const card = frame.getByRole('article').filter({ hasText: 'Hello World Service' });
  await card.waitFor({ state: 'visible', timeout: 15000 });
  console.log('sample filtered and shown: Hello World Service');

  console.log('done: 03_search_sample');
}
