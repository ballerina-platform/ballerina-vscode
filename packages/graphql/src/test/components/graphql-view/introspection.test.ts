/**
 * @jest-environment node
 */
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

import { fillLeafs } from "@graphiql/toolkit";
import {
    buildClientSchema,
    getNamedType,
    GraphQLObjectType,
    IntrospectionQuery,
    isLeafType,
    parse,
    TypeInfo,
    validate,
    visit,
    visitWithTypeInfo,
} from "graphql";
import {
    createGetDefaultFieldNames,
    createServedMetaFieldsRule,
    getServedMetaFields,
} from "../../../components/graphql-view/introspection";
import issue1821 from "../../fixtures/issue-1821.json";

// issue-1821.json: the introspection response of a ballerina/graphql 1.19.1 service, captured
// with `getIntrospectionQuery()` exactly as the Try It view sends it. That runtime serves no
// `__Type.specifiedByURL`/`isOneOf`, `__InputValue.isDeprecated`/`deprecationReason` or
// `__Directive.isRepeatable`, while graphql-js's built-in meta types (which the client schema
// uses) declare all of them.
const introspection = (issue1821 as unknown as { data: IntrospectionQuery }).data;
const schema = buildClientSchema(introspection);
const served = getServedMetaFields(introspection);

// What the server declares, read straight from the fixture rather than through the code under test.
const declaredByServer = new Map<string, string[]>();
for (const type of introspection.__schema.types) {
    if (type.name.startsWith("__") && "fields" in type && type.fields) {
        declaredByServer.set(type.name, type.fields.map((field) => field.name));
    }
}

// A query prefix that reaches each meta type, so a field can be selected on it.
const META_TYPE_PATHS: Record<string, (selection: string) => string> = {
    __Schema: (s) => `{ __schema { ${s} } }`,
    __Type: (s) => `{ __type(name: "Query") { ${s} } }`,
    __Field: (s) => `{ __type(name: "Query") { fields { ${s} } } }`,
    __InputValue: (s) => `{ __type(name: "Query") { fields { args { ${s} } } } }`,
    __EnumValue: (s) => `{ __type(name: "__TypeKind") { enumValues { ${s} } } }`,
    __Directive: (s) => `{ __schema { directives { ${s} } } }`,
};

// Every meta-typed position left without a selection, for GraphiQL to auto-fill.
const UNSELECTED_META_QUERIES = Object.values(META_TYPE_PATHS).map((path) => {
    const query = path("__SELECTION__");
    return query.replace(/\s*\{ __SELECTION__ \}/, "");
});

/** Every `ParentType.field` the document selects on a meta type. */
function metaFieldsSelected(query: string): string[] {
    const typeInfo = new TypeInfo(schema);
    const selected: string[] = [];
    visit(
        parse(query),
        visitWithTypeInfo(typeInfo, {
            Field(node) {
                const parent = typeInfo.getParentType();
                if (parent?.name.startsWith("__") && node.name.value !== "__typename") {
                    selected.push(`${parent.name}.${node.name.value}`);
                }
            },
        })
    );
    return selected;
}

const isServed = (coordinate: string): boolean => {
    const [typeName, fieldName] = coordinate.split(".");
    return declaredByServer.get(typeName)?.includes(fieldName) ?? false;
};

describe("fixture", () => {
    it("lists every meta type the corpus reaches", () => {
        expect(Array.from(declaredByServer.keys()).sort()).toEqual(Object.keys(META_TYPE_PATHS).sort());
    });

    it("lacks the fields reported in issue 1821, which graphql-js declares", () => {
        const builtInType = schema.getType("__Type") as GraphQLObjectType;
        expect(Object.keys(builtInType.getFields())).toEqual(
            expect.arrayContaining(["specifiedByURL", "isOneOf"])
        );
        expect(declaredByServer.get("__Type")).not.toContain("specifiedByURL");
        expect(declaredByServer.get("__Type")).not.toContain("isOneOf");
    });
});

describe("auto-fill (getDefaultFieldNames)", () => {
    const getDefaultFieldNames = createGetDefaultFieldNames(served);

    it.each(UNSELECTED_META_QUERIES)("fills only server-served meta fields: %s", (query) => {
        const filled = fillLeafs(schema, query, getDefaultFieldNames).result;
        expect(filled).not.toEqual(query);
        expect(metaFieldsSelected(filled!).filter((field) => !isServed(field))).toEqual([]);
    });

    it("would fill unserved meta fields without it (the corpus exercises the gap)", () => {
        const unserved = UNSELECTED_META_QUERIES.flatMap((query) =>
            metaFieldsSelected(fillLeafs(schema, query).result!).filter((field) => !isServed(field))
        );
        expect(unserved).toEqual(
            expect.arrayContaining(["__Type.specifiedByURL", "__Type.isOneOf", "__InputValue.deprecationReason"])
        );
    });

    it("leaves every non-meta type at GraphiQL's default", () => {
        for (const type of Object.values(schema.getTypeMap())) {
            if (type.name.startsWith("__") || !("getFields" in type)) {
                continue;
            }
            const fields = type.getFields();
            const leafNames = Object.keys(fields).filter((name) => isLeafType(fields[name].type));
            const expected = fields.id ? ["id"] : fields.edges ? ["edges"] : fields.node ? ["node"] : leafNames;
            expect(getDefaultFieldNames(type)).toEqual(expected);
        }
    });

    it("does not filter when the server lists no meta types", () => {
        const unfiltered = createGetDefaultFieldNames(new Map());
        const builtInType = schema.getType("__Type") as GraphQLObjectType;
        expect(unfiltered(builtInType)).toEqual(expect.arrayContaining(["specifiedByURL", "isOneOf"]));
    });
});

describe("editor validation (createServedMetaFieldsRule)", () => {
    const rule = createServedMetaFieldsRule(served);

    // Every field graphql-js lets the editor select on each meta type, as `__Type.name`.
    const allMetaFields = Object.keys(META_TYPE_PATHS).flatMap((typeName) =>
        Object.keys((schema.getType(typeName) as GraphQLObjectType).getFields()).map((f) => `${typeName}.${f}`)
    );

    function selectField(coordinate: string): string {
        const [typeName, fieldName] = coordinate.split(".");
        const fieldType = (schema.getType(typeName) as GraphQLObjectType).getFields()[fieldName].type;
        const selection = isLeafType(getNamedType(fieldType)) ? fieldName : `${fieldName} { __typename }`;
        return META_TYPE_PATHS[typeName](selection);
    }

    it.each(allMetaFields)("flags %s exactly when the server does not serve it", (coordinate) => {
        const errors = validate(schema, parse(selectField(coordinate)), [rule]);
        if (isServed(coordinate)) {
            expect(errors).toEqual([]);
        } else {
            const [typeName, fieldName] = coordinate.split(".");
            expect(errors.map((e) => e.message)).toEqual([
                `Cannot query field "${fieldName}" on type "${typeName}". This GraphQL service does not support it.`,
            ]);
        }
    });

    it("never flags __typename or fields on the service's own types", () => {
        const query = "{ __typename books { __typename title year } greeting __type(name: \"Book\") { __typename } }";
        expect(validate(schema, parse(query), [rule])).toEqual([]);
    });

    it("flags nothing when the server lists no meta types", () => {
        const query = META_TYPE_PATHS.__Type("specifiedByURL isOneOf");
        expect(validate(schema, parse(query), [createServedMetaFieldsRule(new Map())])).toEqual([]);
    });
});
