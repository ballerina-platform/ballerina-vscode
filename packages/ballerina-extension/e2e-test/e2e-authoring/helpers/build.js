// Throws with the compiler's output unless the integration's sources on disk compile. Builds a copy
// with `bal build --offline`, which gives a verdict on exactly the saved revision: the status bar's
// problem counts can predate the last save, and an edit that leaves them unchanged shows no new verdict.
// The copy keeps target/ and any Dependencies.toml update out of the project the IDE has open.
// Needs `bal` on PATH, the distribution the extension itself falls back to.
globalThis.assertIntegrationCompiles = (integrationDir) => {
  const copy = fs.mkdtempSync(path.join(sessionDir, 'build-'));
  try {
    fs.cpSync(integrationDir, copy, { recursive: true, filter: (src) => path.basename(src) !== 'target' });
    try {
      return execSync('bal build --offline', { cwd: copy, encoding: 'utf8', stdio: 'pipe', timeout: 5 * 60 * 1000 });
    } catch (error) {
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
      throw new Error(`the integration does not compile:\n${output || error.message}`);
    }
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
};
