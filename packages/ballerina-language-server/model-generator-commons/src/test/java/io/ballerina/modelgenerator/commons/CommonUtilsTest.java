/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.modelgenerator.commons;

import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Tests the raw-vs-escaped invariant of the module-name/type-signature helpers in {@link CommonUtils}: the shared
 * derivation helpers ({@code getImportStatement}, {@code getClassType}) return raw identifiers, while the dedicated
 * emission helpers escape reserved-keyword module segments only when producing source.
 */
public class CommonUtilsTest {

    @DataProvider(name = "rawImportStatements")
    public Object[][] rawImportStatements() {
        return new Object[][]{
                // {orgName, packageName, moduleName, expected}
                {"ballerinax", "hubspot.crm.import", "hubspot.crm.import", "ballerinax/hubspot.crm.import"},
                {"ballerinax", "http", "http", "ballerinax/http"},
                {"ballerinax", "x.function.y", "x.function.y", "ballerinax/x.function.y"},
                {"ballerinax", "foo", "foo.import", "ballerinax/foo.import"},
                {"", "hubspot.crm.import", "hubspot.crm.import", "hubspot.crm.import"},
        };
    }

    @Test(dataProvider = "rawImportStatements")
    public void testGetImportStatementIsRaw(String orgName, String packageName, String moduleName, String expected) {
        Assert.assertEquals(CommonUtils.getImportStatement(orgName, packageName, moduleName), expected);
        Assert.assertFalse(CommonUtils.getImportStatement(orgName, packageName, moduleName).contains("'"),
                "getImportStatement must return a raw identifier without escape quotes");
    }

    @DataProvider(name = "rawClassTypes")
    public Object[][] rawClassTypes() {
        return new Object[][]{
                // {packageName, clientName, expected}
                {"hubspot.crm.import", "Client", "import:Client"},
                {"http", "Client", "http:Client"},
                {"x.type", "Client", "type:Client"},
        };
    }

    @Test(dataProvider = "rawClassTypes")
    public void testGetClassTypeIsRaw(String packageName, String clientName, String expected) {
        Assert.assertEquals(CommonUtils.getClassType(packageName, clientName), expected);
    }

    @DataProvider(name = "escapeImportStatements")
    public Object[][] escapeImportStatements() {
        return new Object[][]{
                // {rawImport, expectedEscaped}
                {"ballerinax/hubspot.crm.import", "ballerinax/hubspot.crm.'import"},
                {"ballerinax/http", "ballerinax/http"},
                {"ballerinax/x.function.y", "ballerinax/x.'function.y"},
                {"foo.import", "foo.'import"},
                {"ballerinax/hubspot.crm.import as _", "ballerinax/hubspot.crm.'import as _"},
                // First segment is a keyword: the `ballerina/xml` package is written unescaped ...
                {"ballerina/xml", "ballerina/xml"},
                // ... but a keyword sub-segment of a lang library must be escaped.
                {"ballerina/lang.xml", "ballerina/lang.'xml"},
                {"ballerina/time", "ballerina/time"},
                // Already-escaped input is left untouched (idempotent).
                {"ballerinax/hubspot.crm.'import", "ballerinax/hubspot.crm.'import"},
        };
    }

    @Test(dataProvider = "escapeImportStatements")
    public void testEscapeImportStatement(String rawImport, String expectedEscaped) {
        Assert.assertEquals(CommonUtils.escapeImportStatement(rawImport), expectedEscaped);
        // Re-escaping an escaped statement is a no-op.
        Assert.assertEquals(CommonUtils.escapeImportStatement(expectedEscaped), expectedEscaped);
    }

    @DataProvider(name = "escapeModulePrefixes")
    public Object[][] escapeModulePrefixes() {
        return new Object[][]{
                // {org, module, expectedPrefix}
                {"ballerinax", "hubspot.crm.import", "'import"},
                {"ballerinax", "hubspot.crm.contacts", "contacts"},
                {"ballerinax", "http", "http"},
                {"ballerina", "lang.int", "int"},   // lang-lib: keyword but must stay unescaped
                {"ballerina", "lang.error", "error"},
        };
    }

    @Test(dataProvider = "escapeModulePrefixes")
    public void testEscapeModulePrefix(String org, String module, String expectedPrefix) {
        Assert.assertEquals(CommonUtils.escapeModulePrefix(org, module), expectedPrefix);
    }

    @DataProvider(name = "typeSignatures")
    public Object[][] typeSignatures() {
        return new Object[][]{
                // {rawSignature, expectedEscaped}
                {"import:Rec", "'import:Rec"},
                {"map<import:Rec>", "map<'import:Rec>"},
                {"import:A|http:Response", "'import:A|http:Response"},
                {"import:Rec[]", "'import:Rec[]"},
                {"table<map<import:Rec>>", "table<map<'import:Rec>>"},
                {"int:Signed32", "int:Signed32"},          // lang-lib: not escaped
                {"error:StackFrame[]", "error:StackFrame[]"}, // lang-lib: not escaped
                {"string:Char", "string:Char"},            // lang-lib: not escaped
                {"Rec", "Rec"},                            // no qualifier
                {"'import:Rec", "'import:Rec"},            // already escaped: idempotent
                {"map<any|error>", "map<any|error>"},      // builtin, no module qualifier
        };
    }

    @Test(dataProvider = "typeSignatures")
    public void testEscapeTypeSignatureModulePrefixes(String rawSignature, String expectedEscaped) {
        Assert.assertEquals(CommonUtils.escapeTypeSignatureModulePrefixes(rawSignature), expectedEscaped);
    }

    @DataProvider(name = "reservedKeywords")
    public Object[][] reservedKeywords() {
        return new Object[][]{
                {"import"}, {"function"}, {"type"}, {"foo"}, {"contacts"},
        };
    }

    @Test(dataProvider = "reservedKeywords")
    public void testEscapeUnescapeRoundTrip(String segment) {
        String escaped = org.ballerinalang.langserver.common.utils.CommonUtil.escapeReservedKeyword(segment);
        Assert.assertEquals(
                org.ballerinalang.langserver.common.utils.CommonUtil.unescapeReservedKeyword(escaped), segment);
    }

    @Test
    public void testModuleNameRoundTrip() {
        String raw = "hubspot.crm.import";
        String escaped = CommonUtils.escapeModuleName(raw);
        Assert.assertEquals(escaped, "hubspot.crm.'import");
        Assert.assertEquals(CommonUtils.unescapeModuleName(escaped), raw);
    }

    /**
     * Corpus of real type signatures harvested from every {@code ballerinaType}/TYPE value across the
     * flow-model-generator and service-model-generator test resources (see {@code type-signature-corpus.txt}).
     * None of these reference a reserved-keyword module, so the emission-time escaper must leave every one of them
     * byte-identical. This guards against the escaper regex ever corrupting a normal type signature.
     */
    @DataProvider(name = "typeSignatureCorpus")
    public Object[][] typeSignatureCorpus() throws IOException {
        List<Object[]> rows = new ArrayList<>();
        try (InputStream in = CommonUtilsTest.class.getResourceAsStream("/type-signature-corpus.txt")) {
            Assert.assertNotNull(in, "type-signature-corpus.txt must be on the test classpath");
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isEmpty()) {
                    rows.add(new Object[]{line});
                }
            }
        }
        Assert.assertTrue(rows.size() > 500, "corpus should be substantial, found: " + rows.size());
        return rows.toArray(new Object[0][]);
    }

    @Test(dataProvider = "typeSignatureCorpus")
    public void testEscaperIsNoOpOnRealTypeSignatures(String signature) {
        Assert.assertEquals(CommonUtils.escapeTypeSignatureModulePrefixes(signature), signature,
                "Escaper must not alter a non-keyword-module type signature");
    }
}
