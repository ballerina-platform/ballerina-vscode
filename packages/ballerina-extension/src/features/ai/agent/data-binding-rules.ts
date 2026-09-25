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

/**
 * System-prompt rules for binding external data into records and for type casts.
 *
 * Open-versus-closed records: an S3 event notification consumed from SQS was bound to closed
 * `record {| ... |}` types and failed at run time on the first real event ("field 'Records[0].eventVersion'
 * cannot be added to the closed record"); the compiler cannot report the mismatch, so the rule scopes closed
 * records to schemas the generated code owns.
 *
 * Type casts: generated code cast values without checking what they were (`<map<json>>jwt:Payload`,
 * `<T>jsonValue`). A cast checks the value's inherent type, not its contents, so these compile and panic with
 * `{ballerina}TypeCastError`. An open record's rest field is `anydata`, so no open record value is a
 * `map<json>`, while a closed record whose fields are json-compatible is one. Every statement was run on
 * Ballerina 2201.13.4.
 *
 * Copying: generated code seeded a mutable `map<OrderRecord>` from a `readonly & map<OrderRecord>` with
 * `knownOrders[orderId].clone()`, so the map held immutable members and the first field update panicked
 * (wso2/product-integrator#2441). `readonly` distributes into members, and per the `ballerina/lang.value`
 * API docs `clone()` "does not copy immutable subtrees" while `cloneWithType()` takes "the read-only bit
 * ... from the specified type descriptor".
 *
 * Kept in its own module (no imports) so it can be unit-tested without loading the extension host.
 * Interpolated into the system prompt by getSystemPrompt() in ./prompts.ts.
 */
export const DATA_BINDING_CODING_RULES = `## Data binding, type casts and narrowing

### Records for external data
- Records that bind data from an EXTERNAL system should preferably be OPEN records (\`record { ... }\`) because their exact shape is not known; an open record implicitly accepts extra \`anydata\` fields. If a library defines a record for an external schema, use that record type. If the code defines its own record for an external schema, declare it open.
- In such records, declare only the fields the code uses and mark any field that may be absent optional (\`string eventVersion?;\`).

### Type casts

- Whether a record can be cast to \`map<json>\` depends on how the record TYPE is declared, not on the values in it:
  - A CLOSED record (\`record {| ... |}\`) whose fields are all json-compatible types (string, int, float, decimal, boolean, nil, json, json-compatible arrays and other such json-compatible closed records) IS a \`map<json>\`, So \`<map<json>>closedValue\` is safe.
  - An OPEN record (\`record { ... }\`, no bars) may hold extra fields of type \`anydata\`, so it is NOT a \`map<json>\` even when every field in it happens to be JSON: \`<map<json>>openValue\` compiles and panics.
- To get a \`map<json>\` from an open record, convert instead of casting: \`map<json> m = check payload.cloneWithType();\` or \`json j = payload.toJson();\`. If you only need a map view, \`map<anydata>\` accepts any record.

### Check or convert instead of guessing
- Do not guess a type and cast to it. Check first with \`if x is T { ... }\` (inside the block \`x\` is a \`T\`), or convert with \`T v = check x.ensureType();\`; both return an error instead of panicking.
- To turn \`json\` into a record use \`T v = check x.cloneWithType();\` — never \`<T>jsonValue\`.

### Copying values
- \`.clone()\` does NOT copy immutable subtrees: on an already-immutable value it returns that SAME value, still immutable.
- \`.clone()\` does, however, copy mutable values, creating a new mutable copy.
- \`readonly\` distributes into members: whenever a structured type (such as a map, array, table, etc.) OR its member type is \`readonly\`, the members have type \`T & readonly\` even when \`T\` is a mutable record — for example, \`T[] & readonly\` and \`(T & readonly)[]\`, \`map<T> & readonly\` and \`map<T & readonly>\`, and likewise for tables, records and tuples, etc. Judge immutability by the value's INHERENT type not by the STATIC type of the variable you assign it to: \`T? v = items[k].clone();\` is still immutable, type-checks with no diagnostic, and panics on the first in-place update with an \`InvalidUpdate\` error.
- To get a mutable copy of a readonly value use \`T v = check ro.cloneWithType();\`, with a target type that is not itself \`readonly\`.

### Reading fields
- Access record fields with member access (\`.\`) for the field name known at compile time.
- Never cast to reach a field. To read a field the record type does not declare, or a field whose name is only known at run time, use member access on the record and check the result: \`anydata claim = payload[claimName]; if claim is string { ... }\`, Member access gives \`()\` when the field is absent..
- To access members of a JSON, Always convert it to a record first: \`record { string sub; } payload = check jsonValue.cloneWithType();\`, and then read the field: \`string sub = payload.sub;\`.`;
