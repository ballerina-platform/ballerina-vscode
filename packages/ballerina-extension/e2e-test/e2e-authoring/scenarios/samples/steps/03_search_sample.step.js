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

  // The search must narrow the list down to exactly this one sample —
  // otherwise step 04's "Use this" click could hit the wrong card if more
  // than one result matched "Hello World Service".
  const articleCount = await frame.getByRole('article').count();
  if (articleCount !== 1) {
    throw new Error(`expected exactly 1 filtered sample, found ${articleCount}`);
  }
  console.log('sample filtered and shown: Hello World Service');

  console.log('done: 03_search_sample');
}
