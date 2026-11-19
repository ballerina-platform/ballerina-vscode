// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

// Shared by the main Copilot and the form and field Copilots, so both read nil the same way.
export const NIL_RULES = `- A field declared \`T? name?\` is optional and can be nil: read it with ?. (\`order?.customer\`), and read every field after a value that can be nil with ?. too (\`order?.customer?.name\`). A plain dot on it does not compile. A field declared \`T name?\` or \`T? name\` reads with a plain dot.
- ?. gives nil when a field is absent or nil. Default the result with ?: where a value is needed: \`order?.customer?.name ?: ""\`.
- An is or != () check narrows a variable, never a field access. Bind the value to a variable first; inside one expression, with let: \`let Customer? customer = order?.customer in customer is Customer ? customer.name : ""\`.
- A \${...} in a string template cannot hold nil: default it inside, e.g. \`\${order?.note ?: ""}\`.
- Default an optional list before you iterate over it: \`from var item in order?.items ?: [] select item.title\`.
- There is no ?. method call: \`note?.trim()\` does not compile. Default the value first: \`(order?.note ?: "").trim()\`.`;
