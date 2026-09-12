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

import type { DiagnosticEntry, Diagnostics } from '@wso2/ballerina-core';
import * as path from 'path';

/**
 * Diagnostic entry enriched with a resolving hint
 */
export interface EnrichedDiagnostic extends DiagnosticEntry {
    hint?: string;
}

/**
 * Map of Ballerina diagnostic codes to resolving hints.
 *
 * Each entry maps a diagnostic code (e.g., "BCE3943") to a directive hint on how to
 * resolve it. Hints ride along with the diagnostics returned by the
 * getCompilationErrors tool so the agent can apply the canonical fix instead of
 * guessing at the compiler's isolation/lock terminology.
 *
 * The isolation/lock entries were derived from the ballerina-lang
 * compiler sources (IsolationAnalyzer.java, DiagnosticErrorCode.java,
 * compiler.properties) and the language server's quick-fix code actions
 * (AddIsolatedQualifierCodeAction, AddLockCodeAction, AddReadonlyCodeAction,
 * CloneValueCodeAction, ConvertToReadonlyCloneCodeAction). The comment above each
 * entry quotes the compiler's message template for that code.
 */
export const DIAGNOSTIC_HINTS: Readonly<Record<string, string>> = {
    "BCE2000": "This usually indicates a missing import statement. Please ensure that all necessary modules are imported in each file where they are used.",

    // ---- Lock statement structural rules ----

    // "cannot use a named worker inside a lock statement"
    "BCE2080": "A lock statement must not start new strands. Move the `worker` declaration outside the lock: " +
        "read the protected values into local variables inside `lock { }`, close the lock, then declare the worker using those locals.",

    // "cannot use an async call inside a lock statement"
    "BCE2081": "`start` is not allowed inside a `lock` statement. Read the protected values into local variables inside " +
        "`lock { }`, close the lock, then call `start` with the locals (e.g. `int localN; lock { localN = n; } future<int> f = start compute(localN);`).",

    // "using send action within the lock statement is not allowed to prevent possible deadlocks"
    "BCE4042": "Worker send (`->`) is not allowed inside a `lock` statement (deadlock prevention). Use the lock only to " +
        "read/write the shared state into local variables, then perform the send outside the lock.",

    // "using receive action within the lock statement is not allowed to prevent possible deadlocks"
    "BCE4043": "Worker receive (`<-`) is not allowed inside a `lock` statement (deadlock prevention). Receive the message " +
        "into a local variable outside the lock, then update the shared state inside a `lock { }` block.",

    // ---- Isolated functions ----

    // "invalid access of mutable storage in an 'isolated' function"
    "BCE3943": "An `isolated` function may only access module-level state that is either "
        + "(a) `final`/`configurable` with an immutable (`readonly`) or isolated-object type (client, listener, `ai:Agent`, `isolated class`), or "
        + "(b) declared `isolated` and accessed only inside `lock { }`. "
        + "Fix: never mutated -> declare it `final` (with an immutable type for map/array/record). "
        + "Shared mutable module variable -> declare it `isolated` (e.g. `isolated int[] stack = [];`) and wrap every access in `lock { }`. "
        + "Shared mutable service/class field -> declare it `private` (class/servuce fields cannot be `isolated`) and access it via `self` inside `lock { }`. "
        + "If the reported variable is already `final` with an isolated-object type, the error comes from another variable in the same function. "
        + "Do NOT drop the `isolated` qualifier from a resource/remote method; that disables concurrent dispatch.",

    // "invalid access of mutable storage in the default value of a record field"
    "BCE3944": "A record field's default value must be an isolated expression. Replace the reference to mutable module " +
        "state with a literal or a `final` readonly value, or require the field explicitly and set it where the record is created.",

    // "invalid access of mutable storage in the initializer of an object field"
    "BCE3945": "An object field initializer must be an isolated expression. Use a literal or `final` readonly value, or " +
        "move the assignment into a non-`isolated` `init()` method (inside an `isolated` init the assigned value must " +
        "still be an isolated expression, e.g. `self.f = v.clone();`).",

    // "incompatible types: expected an 'isolated' function"
    "BCE3946": "The function value passed here must be `isolated` (e.g. arguments to langlib functions like `array:forEach` " +
        "called from an isolated context). Add the `isolated` qualifier to the function or anonymous function being passed.",

    // "invalid invocation of a non-isolated function in an 'isolated' function"
    "BCE3947": "An `isolated` function may only call `isolated` functions. Add the `isolated` qualifier to the called " +
        "function (its own body must also satisfy isolation rules, transitively). If the callee is third-party and not isolated, " +
        "restructure so the isolated function does not call it.",

    // "invalid invocation of a non-isolated function in the default value of a record field"
    "BCE3948": "A function invoked in a record field's default value must be `isolated`. Make the called function `isolated`, " +
        "or replace the default with a literal and compute the value where the record is created.",

    // "invalid invocation of a non-isolated function in the initializer of an object field"
    "BCE3949": "A function invoked in an object field initializer must be `isolated`. Make the called function `isolated`, " +
        "or move the computation into a non-`isolated` `init()` method (inside an `isolated` init the called function " +
        "must still be `isolated`).",

    // "invalid non-isolated initialization expression in an 'isolated' function"
    "BCE3950": "`new` of a class whose `init` method is not `isolated` is not allowed here. Add the `isolated` qualifier " +
        "to the class's `init` method (and make sure `init` itself follows isolated-function rules).",

    // "invalid non-isolated initialization expression in the default value of a record field"
    "BCE3951": "The class instantiated in this record field default must have an `isolated` `init` method. Make `init` isolated, " +
        "or drop the default and construct the value where the record is created.",

    // "invalid non-isolated initialization expression in the initializer of an object field"
    "BCE3952": "The class instantiated in this object field initializer must have an `isolated` `init` method. Make `init` " +
        "isolated, or move the construction into a non-`isolated` `init()` method of the enclosing object.",

    // "'strand' annotation not allowed in a ... in an 'isolated' function"
    "BCE3953": "Remove the `@strand` annotation — it is not allowed in an `isolated` function (and is deprecated in general).",

    // "invalid start action calling a non-isolated function in an 'isolated' function"
    "BCE3954": "`start` inside an `isolated` function may only call `isolated` functions. Add the `isolated` qualifier to " +
        "the function being started.",

    // "invalid start action accessing a non isolated expression in an argument..."
    "BCE3955": "Arguments to `start` in an `isolated` function must be isolated expressions. Pass an immutable value, or a " +
        "fresh copy of a local/parameter value: `start process(data.clone())` (or `.cloneReadOnly()`). Cloning module-level " +
        "mutable state directly in the argument does NOT help (that reports BCE3943) — read it into a local inside a " +
        "`lock { }` first, then pass a clone of that local: `start process(localData.clone())`.",

    // ---- Isolated objects ----

    // "invalid non-private mutable field in an isolated object"
    "BCE3956": "Every mutable field of an isolated object/class must be `private`. Add the `private` qualifier, or make the " +
        "field `final` with an immutable (`readonly`) or isolated-object type if it is never reassigned.",

    // "invalid access of a mutable field of an 'isolated' object outside a 'lock' statement"
    "BCE3957": "Access to a mutable `self` field of an isolated object must be inside a `lock` statement. Wrap the statement(s) " +
        "in `lock { ... }` (group nearby accesses of the field into one lock; values leaving the lock must be cloned — see BCE3959).",

    // "invalid initial value expression: expected an isolated expression"
    "BCE3958": "The initial value of isolated state must be an isolated expression. This fires on (a) the initializer of an " +
        "`isolated` variable, or (b) an assignment to a `self` field inside an `isolated` class's `init` method. Use a " +
        "literal, a fresh constructor (e.g. `[]`, `{}`, `new Foo()` with an isolated `init`), or a copy — most commonly " +
        "change `self.data = data;` to `self.data = data.clone();` (or `.cloneReadOnly()`).",

    // ---- Restricted lock (transfer) rules ----

    // "invalid attempt to transfer out a value from a 'lock' statement with restricted variable usage: expected an isolated expression"
    "BCE3959": "A value leaving a lock that protects an isolated variable or `self` (via `return` or assignment to an outer " +
        "variable) must not alias the protected state. Return/assign a copy: `return m[k].clone();` (or `.cloneReadOnly()` " +
        "when an immutable result is acceptable). Alternatively declare the protected storage's member type as `T & readonly` " +
        "so reads are already immutable. A single isolated object (a client, a caller) may leave as-is; an ARRAY or MAP of them " +
        "may not — copy the keys (`m.keys().clone()`) and fetch one element per lock instead.",

    // "invalid attempt to transfer a value into a 'lock' statement with restricted variable usage"
    "BCE3960": "A mutable value defined outside this lock must not be referenced inside it in a non-isolated expression " +
        "(storing it — or even aliasing it to a local — could create an outside alias to protected state). Use a copy " +
        "instead: `m[k] = v.clone();`, or declare the incoming parameter/variable as `readonly & T` so it is immutable.",

    // "invalid invocation of a non-isolated function in a 'lock' statement with restricted variable usage"
    "BCE3961": "Only `isolated` functions may be called inside a lock that accesses an isolated variable or `self` of an " +
        "isolated object. Add the `isolated` qualifier to the called function, or move the call outside the lock.",

    // "invalid access of an 'isolated' variable outside a 'lock' statement"
    "BCE3962": "An `isolated` module variable may only be accessed inside a `lock` statement. Wrap the access in `lock { ... }`. " +
        "Remember: one lock may access only ONE isolated variable, and values crossing the lock boundary must be cloned.",

    // "cannot assign to a variable outside the 'lock' statement with restricted variable usage, if not just a variable name"
    "BCE3963": "Inside a lock with restricted variable usage, a destructuring assignment to outer state is not allowed — " +
        "an assignment out of the lock must target a plain variable name. Assign the (cloned) value to a simple outer " +
        "variable inside the lock, or capture it in a local and update the outer structure after the lock. " +
        "(Assignments through member/index access on outer state report BCE3960 instead.)",

    // "cannot access more than one variable for which usage is restricted in a single 'lock' statement"
    "BCE3964": "A single `lock` statement may access only ONE isolated variable (or `self` of an isolated object). Split the " +
        "logic into separate lock statements, copying needed values into locals in between (e.g. `int bv; lock { bv = b; } " +
        "lock { a += bv; }`). If two pieces of state must change atomically together, merge them into one protected value " +
        "(e.g. a single isolated record/map holding both).",

    // "an uninitialized module variable declaration cannot be marked as 'isolated'"
    "BCE3965": "An `isolated` module variable must be initialized at the declaration. Add an initializer that is an isolated " +
        "expression (e.g. `isolated int[] data = [];`).",

    // "only a simple variable can be marked as 'isolated'"
    "BCE3966": "`isolated` can only be applied to a simple variable declaration — not to destructuring/binding patterns. " +
        "Declare a plain variable instead.",

    // ---- Match guards ----

    // "cannot call a non-isolated function/method in a match guard when the type of the action/expression being matched is not a subtype of 'readonly'"
    "BCE4018": "A function called in a match guard must be `isolated` when the matched value is not `readonly`. Add the " +
        "`isolated` qualifier to the guard function, or match over a `readonly` value.",

    // "cannot call a function/method in a match guard with an argument of a type that is not a subtype of 'readonly'"
    "BCE4019": "Arguments to a function call in a match guard must be `readonly` when the matched value is not itself " +
        "`readonly`. Pass an immutable copy: replace `arg` with `arg.cloneReadOnly()`, or match over a `readonly` value.",

    // "invalid access of an isolated variable outside a lock statement in the default value of a record field"
    "BCE4025": "A record field's default value cannot reference an `isolated` variable directly. Use a literal default, or " +
        "keep the default by calling an `isolated` function that reads the variable inside `lock { }` (e.g. " +
        "`type R record {| int f = readCount(); |};` where `isolated function readCount() returns int { lock { return count; } }`).",
};

/**
 * Converts language server Diagnostics to EnrichedDiagnostic entries with hints.
 * Filters for error-level diagnostics (severity === 1) only.
 */
export function transformDiagnostics(diagnostics: Diagnostics[]): EnrichedDiagnostic[] {
    const errors: EnrichedDiagnostic[] = [];

    for (const diagParam of diagnostics) {
        for (const diag of diagParam.diagnostics) {
            // Only include error-level diagnostics
            if (diag.severity !== 1) {
                continue;
            }

            const code = diag.code === undefined || diag.code === null ? "" : diag.code.toString();
            const fileName = path.basename(diagParam.uri);
            const msgPrefix = `[${fileName}:${diag.range.start.line},${diag.range.start.character}:${diag.range.end.line},${diag.range.end.character}] `;

            const diagnosticEntry: EnrichedDiagnostic = {
                message: msgPrefix + diag.message
            };
            if (code !== "") {
                diagnosticEntry.code = code;
            }

            // Add hint if available for this diagnostic code
            const hint = DIAGNOSTIC_HINTS[code];
            if (hint) {
                diagnosticEntry.hint = hint;
            }

            errors.push(diagnosticEntry);
        }
    }

    return errors;
}
