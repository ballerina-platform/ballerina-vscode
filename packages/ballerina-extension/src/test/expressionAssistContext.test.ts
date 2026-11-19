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

import { ERROR_HINTS, NEW_NODE_MARKER, NODE_MARKER, buildFormPrompt, describeDiagnostic, isGrounded, shortTypeNames, fitTypeDescription, locateParseError, unmatchedBracket, declaredType, keywordHints, looksLikePlainText, markNode, scopeNames, withoutCascades } from "../features/ai/expression-assist/prompts";

const FLOW = [
    "    resource function post invoice(Order ord) returns Invoice|error {",
    "        if ord.items.length() == 0 {",
    "",
    "        }",
    "        return invoice;",
    "    }",
    "",
].join("\n");

describe("markNode", () => {
    it("marks a new node inside an empty block, keeping its indent", () => {
        const lines = markNode(FLOW, 10, { line: 12, offset: 12 }).split("\n");
        expect(lines[2]).toBe(`            ${NEW_NODE_MARKER}`);
        expect(lines[1]).toContain("if ord.items.length() == 0");
    });

    it("marks an existing statement in front of it", () => {
        expect(markNode(FLOW, 10, { line: 14, offset: 8 }).split("\n")[4]).toBe(`        ${NODE_MARKER} return invoice;`);
    });

    it("marks a new node after a statement on a line of its own", () => {
        const lines = markNode(FLOW, 10, { line: 14, offset: 23 }).split("\n");
        expect(lines[4]).toBe("        return invoice;");
        expect(lines[5]).toBe(`        ${NEW_NODE_MARKER}`);
    });

    it("gives nothing for a position outside the function", () => {
        expect(markNode(FLOW, 10, { line: 3, offset: 0 })).toBe("");
    });

    it("keeps a long function's first line and the lines around the node", () => {
        const body = Array.from({ length: 200 }, (_, i) => `        int v${i} = ${i};`);
        const marked = markNode(["function long() {", ...body, "}"].join("\n"), 0, { line: 120, offset: 8 }).split("\n");
        expect(marked[0]).toBe("function long() {");
        expect(marked).toContain(`        ${NODE_MARKER} int v119 = 119;`);
        expect(marked.length).toBeLessThan(60);
    });
});

describe("withoutCascades", () => {
    const cascade = "a type compatible with mapping constructor expressions not found in type '(json|error)'";

    it("drops the mapping error when a field's own error explains it", () => {
        expect(withoutCascades([cascade, "incompatible types: expected 'string', found 'Seconds?'"]))
            .toEqual(["incompatible types: expected 'string', found 'Seconds?'"]);
    });

    it("keeps the mapping error when it is the only one", () => {
        expect(withoutCascades([cascade])).toEqual([cascade]);
    });
});

describe("ERROR_HINTS", () => {
    const hintsFor = (error: string) => ERROR_HINTS.filter(({ test }) => test.test(error)).map(({ hint }) => hint);

    it("tells an optional record's field access apart from a query's", () => {
        const optional = hintsFor("invalid operation: type 'Enterprise?' does not support field access");
        expect(optional).toHaveLength(1);
        expect(optional[0]).toContain("customer?.id");
        expect(hintsFor("invalid operation: type 'seq Item' does not support field access")[0]).toContain("collect sum(quantity)");
    });

    it("points at a stray closing bracket and a nil value in a template", () => {
        expect(hintsFor("invalid token ')' after '…login) ?: \"\"'")[0]).toContain("closing bracket has no opening one");
        expect(hintsFor("incompatible types: expected '(int|float|decimal|string|boolean)', found 'string?'")[0]).toContain("cannot hold nil");
    });
});

describe("locateParseError", () => {
    const expression = 'string `${(org ?: "") ?: "")}/${repo}`';

    it("names the text before a stray token", () => {
        expect(locateParseError("invalid token ')'", { line: 0, character: 27 }, expression))
            .toBe("invalid token ')' after '…`${(org ?: \"\") ?: \"\"'");
    });

    it("counts earlier lines and leaves other errors alone", () => {
        expect(locateParseError("missing close brace token", { line: 1, character: 3 }, "{a: 1,\nb: 2")).toBe("missing close brace token after '{a: 1,\nb: '");
        expect(locateParseError("undefined symbol 'x'", { line: 0, character: 3 }, "1 + x")).toBe("undefined symbol 'x'");
    });
});

describe("keyword parameter names", () => {
    const names = scopeNames("- currency: string (configurable variables)\n- 'order: Order (parameters)");

    it("reads the names in scope", () => {
        expect(names).toEqual(["currency", "'order"]);
    });

    it("never takes code or a value in scope for unquoted text", () => {
        expect(looksLikePlainText("0.0.0.0", names)).toBe(true);
        expect(looksLikePlainText("order.customer.firstName", names)).toBe(false);
        expect(looksLikePlainText("order.id + \" \" + x", names)).toBe(false);
    });

    it("asks for the quote only when it is missing", () => {
        expect(keywordHints("order.customer.firstName", names)).toHaveLength(1);
        expect(keywordHints("'order.customer.firstName", names)).toEqual([]);
    });
});

describe("declaredType", () => {
    const slot = (type: object) => ({ types: [{ selected: true, ...type }] }) as any;

    it("lists a select's options", () => {
        expect(declaredType(slot({ fieldType: "SINGLE_SELECT", options: [{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }] })))
            .toBe('one of "GET" | "POST", written bare');
    });

    it("lists the select's values when the field is in its expression mode", () => {
        const property = { types: [
            { fieldType: "SINGLE_SELECT", selected: false, options: [{ label: "CLAUDE_SONNET_4_6", value: '"claude-sonnet-4-6"' }] },
            { fieldType: "EXPRESSION", selected: true, ballerinaType: "anthropic:ANTHROPIC_MODEL_NAMES" },
        ] } as any;
        expect(declaredType(property)).toBe('anthropic:ANTHROPIC_MODEL_NAMES, one of "claude-sonnet-4-6" written exactly so');
    });

    it("gives a toggle true or false", () => {
        expect(declaredType(slot({ fieldType: "FLAG" }))).toBe('one of "true" | "false", written bare');
    });

    it("asks for plain text without quotes", () => {
        expect(declaredType(slot({ fieldType: "STRING" }))).toBe("plain text, written as is without quotes");
    });
});

describe("buildFormPrompt", () => {
    it("lists the form's actions", () => {
        const prompt = buildFormPrompt({
            node: "FORM", instruction: "add a listener on 9092", slots: [], groups: [],
            actions: [{ id: "attachListener", label: "Attach Listener", description: "Opens a form that creates a new listener." }],
        } as any, "", { signature: "", code: "" });
        expect(prompt).toContain("Actions:\n- attachListener (Attach Listener): Opens a form that creates a new listener.");
    });

    it("gives a value its type from the slot it names, and marks earlier turns that changed nothing", () => {
        const prompt = buildFormPrompt({
            node: "VARIABLE", instruction: "or Guest", groups: [], earlier: ["customer name (not done)"],
            slots: [
                { path: "properties.expression", label: "Expression", property: { types: [{ fieldType: "EXPRESSION", selected: true }] }, value: "", typeFrom: "properties.type" },
                { path: "properties.type", label: "Type", property: { types: [{ fieldType: "TYPE", selected: true }] }, value: "int", previous: "string" },
            ],
        } as any, "", { signature: "", code: "" });
        expect(prompt).toContain("- properties.expression (Expression): a value of the type in properties.type; when the request needs another type, set properties.type too = (empty)");
        expect(prompt).toContain("except those marked (not done) or (explained, nothing changed)):\n1. customer name (not done)");
        expect(prompt).toContain("- properties.type (Type): type = int (before this thread: string)");
    });
});

describe("fitTypeDescription", () => {
    const ORDER = "Order record {|Customer? customer?; string id;|}\n  id: The order id.\nCustomer record {|string name;|}\n  name: Full name.";

    it("keeps every record line before any field doc", () => {
        expect(fitTypeDescription(ORDER, 85)).toBe("Order record {|Customer? customer?; string id;|}\nCustomer record {|string name;|}");
    });

    it("keeps docs while there is room, under their own record", () => {
        expect(fitTypeDescription(ORDER, 200)).toBe(ORDER);
    });

    it("ends a record longer than the limit at a field boundary", () => {
        expect(fitTypeDescription(ORDER, 40)).toBe("Order record {|Customer? customer?; …");
    });

    it("reads Windows line endings", () => {
        expect(fitTypeDescription(ORDER.replace(/\n/g, "\r\n"), 85)).toBe("Order record {|Customer? customer?; string id;|}\nCustomer record {|string name;|}");
    });
});

describe("describeDiagnostic", () => {
    const at = (start: number, end: number, line = 0) => ({ start: { line, character: start }, end: { line, character: end } });

    it("names the code at fault and writes out the ?. fix for an optional nilable field", () => {
        const expression = "order.customer ?: \"Guest\"";
        const { error, hint } = describeDiagnostic({ code: "BCE2118", range: at(0, 14), message: "field access cannot be used to access an optional field of a type that includes nil, use optional field access or member access" }, expression);
        expect(error).toMatch(/at `order\.customer`$/);
        expect(hint).toMatch(/^Write order\?\.customer: that field is optional/);
    });

    it("reads on with ?. after a value that can be nil", () => {
        const { hint } = describeDiagnostic({ code: "BCE2556", range: at(0, 25), message: "invalid operation: type 'Customer?' does not support field access" }, "order?.customer.firstName");
        expect(hint).toMatch(/^Write order\?\.customer\?\.firstName:/);
    });

    it("defaults a nilable value by its expected type, and checks an error", () => {
        expect(describeDiagnostic({ code: "BCE2066", range: at(0, 11), message: "incompatible types: expected 'string', found 'string?'" }, "order?.note").hint)
            .toBe("order?.note can be nil: write (order?.note ?: \"\").");
        expect(describeDiagnostic({ code: "BCE2066", range: at(0, 17), message: "incompatible types: expected 'int', found '(int|error)'" }, "int:fromString(s)").hint)
            .toMatch(/^int:fromString\(s\) can also be an error: write check int:fromString\(s\)/);
    });

    it("narrows json, names the nil side of an operator, and checks an error before a default", () => {
        expect(describeDiagnostic({ code: "BCE2066", range: at(0, 23), message: "incompatible types: expected 'string', found '(boolean|int|float|decimal|string|json[]|map<json>)'" }, "check body.contact.mail").hint)
            .toBe("check body.contact.mail is json: narrow it, e.g. let json|error value = body.contact.mail in value is string ? value : \"\".");
        expect(describeDiagnostic({ code: "BCE2070", range: at(0, 22), message: "operator '+' not defined for 'string' and 'string?'" }, "a + \" \" + order?.note").hint)
            .toBe("order?.note can be nil: write (order?.note ?: \"\").");
        expect(describeDiagnostic({ code: "BCE2642", range: at(0, 21), message: "operator '?:' cannot be applied to type '(string|error)'" }, "f(order).trim() ?: \"\"").hint)
            .toMatch(/^f\(order\)\.trim\(\) can be an error but never nil/);
        expect(describeDiagnostic({ code: "BCE2070", range: at(0, 9), message: "operator '+' not defined for 'decimal' and 'float'" }, "a + 0.5f").hint).toBeUndefined();
    });

    it("drops a default from a value that is never nil", () => {
        expect(describeDiagnostic({ code: "BCE2642", range: at(0, 16), message: "operator '?:' cannot be applied to type 'string'" }, "order.id ?: \"x\"").hint)
            .toBe("order.id is never nil, so drop the ?: default.");
    });

    it("leaves a long span to the parse locator and gives no fix for other codes", () => {
        const long = `f(${"a".repeat(90)}`;
        const described = describeDiagnostic({ code: "BCE0001", range: at(92, 92), message: "missing close paren token" }, long);
        expect(described.error).toMatch(/^missing close paren token after '…a+'$/);
        expect(described.hint).toBeUndefined();
    });
});

describe("unmatchedBracket", () => {
    it("names a stray closing bracket and an unclosed opening one", () => {
        expect(unmatchedBracket("(org ?: \"\") ?: \"\")")).toBe("')' after '(org ?: \"\") ?: \"\"' has no opening bracket");
        expect(unmatchedBracket("string `${repo}-${issue.number`")).toBe("'${' after 'string `${repo}-' is never closed");
    });

    it("skips brackets inside strings and templates, and passes balanced values", () => {
        expect(unmatchedBracket("re `[0-9(]+`.isFullMatch(\"a)b\\\"\")")).toBeUndefined();
        expect(unmatchedBracket("string `${(a ?: \"\")}/${b[0]}`")).toBeUndefined();
    });
});

describe("isGrounded", () => {
    const run = {
        errorsSeen: ["properties.expression: undefined symbol 'total' at `total`"],
        seen: ["- payload: Event (parameters)\nUser record {|string login; int id; string? name?;|}"],
    };

    it("takes a compiler error the run got and a name no type shown declares", () => {
        expect(isGrounded(run, "compiler_error", "- undefined symbol 'total'")).toBe(true);
        expect(isGrounded(run, "missing_name", "email")).toBe(true);
        expect(isGrounded(run, "missing_name", "credit card number")).toBe(true);
        expect(isGrounded(run, "off_topic", "")).toBe(true);
    });

    it("refuses an error the run never got and a name a type declares", () => {
        expect(isGrounded(run, "compiler_error", "field access cannot be used")).toBe(false);
        expect(isGrounded(run, "missing_name", "name")).toBe(false);
        expect(isGrounded(run, "missing_name", "payload")).toBe(false);
        expect(isGrounded({ ...run, seen: ["TicketObject record {|string? assignee_email?;|}"] }, "missing_name", "assignee email")).toBe(false);
    });
});

describe("shortTypeNames", () => {
    it("drops the module of the file's own package and keeps a library's prefix", () => {
        const type = "record {| ballerinax/trigger.github:1.0.0:Organization? organization?; acme/order_hub:0.1.0:Customer customer; ballerina/lang.int:0.0.0:Signed32 size; |}";
        expect(shortTypeNames(type, "acme/order_hub")).toBe("record {| github:Organization? organization?; Customer customer; int:Signed32 size; |}");
    });
});

