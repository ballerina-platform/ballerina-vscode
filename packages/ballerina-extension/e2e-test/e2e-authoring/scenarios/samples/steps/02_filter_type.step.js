{
  const frame = await getBIWebview();

  // "Sample" restricts the view to the built-in samples, excluding
  // "Pre-built Integrations" — the resulting count must be strictly smaller
  // than the unfiltered "All" count captured in step 1.
  await guestClick(frame.getByRole('button', { name: 'Sample', exact: true }));

  // Poll for the count to settle below the initial "All" count instead of a
  // fixed sleep — the filtered list updates asynchronously.
  const readCount = async () => {
    const snap = await snapshot();
    const match = snap.match(/(\d+) results?/);
    if (!match) throw new Error(`could not find a results count after filtering by "Sample":\n${snap}`);
    return Number(match[1]);
  };
  const deadline = Date.now() + 15000;
  let filteredCount = await readCount();
  while (filteredCount >= globalThis.initialSampleCount && Date.now() < deadline) {
    await window.waitForTimeout(300);
    filteredCount = await readCount();
  }
  console.log(`sample-only count: ${filteredCount} (was ${globalThis.initialSampleCount})`);
  if (!(filteredCount < globalThis.initialSampleCount)) {
    throw new Error(`expected filtered count (${filteredCount}) to be less than initial count (${globalThis.initialSampleCount})`);
  }

  console.log('done: 02_filter_type');
}
