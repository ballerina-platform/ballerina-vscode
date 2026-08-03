/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import type { WebviewApi } from "vscode-webview";

/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension
 * contexts.
 *
 * This utility also enables webview code to be run in a web browser-based
 * dev server by using native web browser features that mock the functionality
 * enabled by acquireVsCodeApi.
 */
class VSCodeAPIWrapper {
  private vsCodeApi: WebviewApi<unknown> | undefined;
  private initialized = false;

  /**
   * Resolves the VS Code webview API lazily, on first use.
   *
   * Deliberately NOT done in the constructor: this module is also bundled into
   * the federated BI-form remote, which is loaded into ANOTHER extension's
   * webview (the WSO2 Integrator welcome view). That host has already called
   * `acquireVsCodeApi()`, and a second call throws "An instance of the VS Code
   * API has already been acquired" — which, at module scope, breaks loading of
   * the whole remote. Lazily resolving (and swallowing the double-acquire)
   * keeps the embed working; there the form talks over the WS bridge and never
   * needs this API. The instance is cached on `globalThis` so any other copy
   * of this module in the same page reuses it instead of re-acquiring.
   */
  private api(): WebviewApi<unknown> | undefined {
    if (!this.initialized) {
      this.initialized = true;
      const g = globalThis as { __ballerinaVsCodeApi?: WebviewApi<unknown> };
      if (g.__ballerinaVsCodeApi) {
        this.vsCodeApi = g.__ballerinaVsCodeApi;
      } else if (typeof acquireVsCodeApi === "function") {
        try {
          this.vsCodeApi = acquireVsCodeApi();
          g.__ballerinaVsCodeApi = this.vsCodeApi;
        } catch {
          // Already acquired by the embedding host (federated embed) — leave
          // undefined and fall back to the browser shims below.
        }
      }
    }
    return this.vsCodeApi;
  }

  /**
   * Post a message (i.e. send arbitrary data) to the owner of the webview.
   *
   * @remarks When running webview code inside a web browser, postMessage will instead
   * log the given message to the console.
   *
   * @param message Abitrary data (must be JSON serializable) to send to the extension context.
   */
  public postMessage(message: unknown) {
    const api = this.api();
    if (api) {
      api.postMessage(message);
    } else {
      console.log(message);
    }
  }

  /**
   * Get the persistent state stored for this webview.
   *
   * @remarks When running webview source code inside a web browser, getState will retrieve state
   * from local storage (https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
   *
   * @return The current state or `undefined` if no state has been set.
   */
  public getState(): unknown | undefined {
    const api = this.api();
    if (api) {
      return api.getState();
    } else {
      const state = localStorage.getItem("vscodeState");
      return state ? JSON.parse(state) : undefined;
    }
  }

  /**
   * Set the persistent state stored for this webview.
   *
   * @remarks When running webview source code inside a web browser, setState will set the given
   * state using local storage (https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
   *
   * @param newState New persisted state. This must be a JSON serializable object. Can be retrieved
   * using {@link getState}.
   *
   * @return The new state.
   */
  public setState<T extends unknown | undefined>(newState: T): T {
    const api = this.api();
    if (api) {
      return api.setState(newState) as T;
    } else {
      localStorage.setItem("vscodeState", JSON.stringify(newState));
      return newState;
    }
  }
}

// Exports class singleton to prevent multiple invocations of acquireVsCodeApi.
export const vscode = new VSCodeAPIWrapper();
