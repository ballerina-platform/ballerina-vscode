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

import { FunctionModel } from "@wso2/ballerina-core";

/**
 * What each handler of a TCP connection service is for, in the user's terms. A TCP service is mostly its onBytes
 * handler, so the service designer leads with these and leaves onConnect, which only hands each connection over,
 * to the end.
 */
export const TCP_HANDLER_DESCRIPTIONS: Readonly<Record<string, string>> = {
    onBytes: "Runs each time a client sends data",
    onError: "Runs when an error occurs on the connection",
    onClose: "Runs when the client disconnects",
};

export const TCP_ON_CONNECT_DESCRIPTION = "Runs when a client connects, and passes the connection to the handlers above";

const TCP_HANDLER_ORDER = Object.keys(TCP_HANDLER_DESCRIPTIONS);

/**
 * The remote functions of a TCP connection service class, in the order a user reaches for them: onBytes, onError,
 * onClose, then any other remote function in source order.
 */
export function getTcpConnectionHandlers(functions: FunctionModel[] | undefined): FunctionModel[] {
    const rank = (handler: FunctionModel) => {
        const index = TCP_HANDLER_ORDER.indexOf(handler.name?.value);
        return index === -1 ? TCP_HANDLER_ORDER.length : index;
    };
    // Array.prototype.sort is stable, so handlers of equal rank keep their source order.
    return (functions ?? [])
        .filter((handler) => handler.kind === "REMOTE")
        .sort((a, b) => rank(a) - rank(b));
}
