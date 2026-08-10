# @wso2/test-config

Shared Jest configuration and jsdom/browser mocks for the Ballerina VSCode webview packages. See [docs/TEST_GUIDE.md](../../docs/TEST_GUIDE.md) for how to run, write, and add tests at every level.

## Add tests to a package in 3 lines

1. Add the dev dependency and the shared config in `package.json`:

   ```jsonc
   {
     "scripts": { "test": "jest --coverage" },
     "devDependencies": {
       "@wso2/test-config": "workspace:*",
       // standard test toolchain (resolved from the consumer):
       "jest": "29.7.0",
       "ts-jest": "29.3.4",
       "babel-jest": "29.7.0",
       "@babel/core": "7.29.6",
       "@babel/preset-env": "7.27.2",
       "@babel/preset-react": "7.27.1",
       "@babel/preset-typescript": "7.27.1",
       "jest-environment-jsdom": "29.7.0",
       "@testing-library/react": "16.3.0",
       "@testing-library/dom": "10.4.0",
       "@types/jest": "29.5.14"
     }
   }
   ```

   > `@testing-library/jest-dom` is provided transitively by `@wso2/test-config`.
   > `react` / `react-dom` come from the consuming package.

2. Create `jest.config.js`:

   ```js
   const base = require('@wso2/test-config/jest-preset');
   module.exports = { ...base, rootDir: '.' };
   ```

   Package-specific module mocks merge on top:

   ```js
   module.exports = {
     ...base,
     rootDir: '.',
     moduleNameMapper: {
       ...base.moduleNameMapper,
       '^http-proxy-agent$': '<rootDir>/src/test/mocks/proxyAgent.ts',
     },
   };
   ```

3. Run `rush update`, then `rush build --to <package>` (or `pnpm --filter <package> test`).

## What the preset provides

- **Transforms**: `ts-jest` for `.ts/.tsx`, `babel-jest` for `.js/.jsx`; `jsdom` environment.
- **Asset mocks**: CSS/SCSS/SVG/PNG/font imports → identity proxy (no external dep).
- **Setup files** (shared, resolved from this package):
  - `matchMedia.js` — `window.matchMedia`, `scrollIntoView`.
  - `jest.env.js` — `@testing-library/jest-dom`, `structuredClone`/`setImmediate` polyfills, `ResizeObserver`, canvas 2d + `getBoundingClientRect` mocks.
- **Single React instance**: `react`/`react-dom` pinned to the consumer's `node_modules`.
- **Coverage**: collects from `src/**` excluding `*.d.ts`, `*.stories.*`, `src/test/**`.

## Overrides

Anything in the consumer config wins because `base` is spread first. Common overrides: extra `moduleNameMapper` entries, `testEnvironment: 'node'` for host-side (non-DOM) unit tests, additional `setupFiles`.
