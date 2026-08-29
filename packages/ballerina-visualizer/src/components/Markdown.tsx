/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { Suspense } from "react";
import type { Options } from "react-markdown";

/**
 * `react-markdown` and its unified/remark/rehype stack is one of the heaviest
 * dependencies in the bundle. Exported so the prefetcher can warm the same chunk
 * (see `utils/viewPrefetch.ts`) without naming the package a second time.
 */
export const loadMarkdown = () => import("react-markdown");

const ReactMarkdown = React.lazy(loadMarkdown);

/**
 * `ReactMarkdown` behind its own chunk.
 *
 * Use this instead of importing `react-markdown` directly from a view that is
 * itself lazily loaded: a static import pulls the whole markdown stack into that
 * view's chunk, so the view cannot paint until megabytes of parser have loaded —
 * for the overviews that meant waiting on the README renderer before the page
 * appeared at all. Rendering nothing while it loads is deliberate: every caller
 * shows markdown as secondary content, and a spinner in its place would draw the
 * eye to the least important part of the page.
 */
export function Markdown(props: Options) {
    return (
        <Suspense fallback={null}>
            <ReactMarkdown {...props} />
        </Suspense>
    );
}
