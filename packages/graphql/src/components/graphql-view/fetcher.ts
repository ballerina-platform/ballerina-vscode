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

interface Request {
    url: string,
    headers: any,
    method: string,
    body?: string,
}

/**
 * Sends GraphQL requests to the extension host over `postMessage` and settles each with its reply.
 * Each request carries an id that the extension host echoes back, so concurrent requests
 * (e.g. introspection and a query) each settle with their own response, and the listener is
 * removed once it has.
 */
export function createFetcher(postMessage: (message: any) => void) {
    let lastRequestId = 0;

    return (api: string, body: Object, headers: string | undefined): Promise<any> => {
        const request: Request = {
            url: api,
            method: "POST",
            headers: JSON.parse(headers ?? ''),
            body: JSON.stringify(body),
        };
        const id = ++lastRequestId;

        return new Promise(resolve => {
            const onMessage = (event: MessageEvent) => {
                const message = event.data;
                if (message?.command !== 'graphqlResponse' || message.id !== id) {
                    return;
                }
                window.removeEventListener('message', onMessage);
                resolve(message.res || false);
            };
            window.addEventListener('message', onMessage);
            postMessage({
                command: 'graphqlRequest',
                id,
                req: request
            });
        });
    };
}
