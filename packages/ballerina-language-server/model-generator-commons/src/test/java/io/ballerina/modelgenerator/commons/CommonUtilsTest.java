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

import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Tests the reserved-keyword escaping invariant of the module-prefix derivation helpers in {@link CommonUtils}.
 */
public class CommonUtilsTest {

    @DataProvider(name = "importStatements")
    public Object[][] importStatements() {
        return new Object[][]{
                // {orgName, packageName, moduleName}
                {"ballerinax", "hubspot.crm.import", "hubspot.crm.import"}, // keyword terminal segment
                {"ballerinax", "http", "http"},                            // clean single segment
                {"ballerinax", "hubspot.crm.contacts", "hubspot.crm.contacts"}, // clean multi segment
                {"ballerinax", "x.function.y", "x.function.y"},            // keyword middle segment
                {"ballerinax", "type", "import"},                          // keyword pkg + keyword module
                {"ballerinax", "foo", "foo.import"},                       // startsWith branch, keyword tail
                {"", "hubspot.crm.import", "hubspot.crm.import"},          // no org
        };
    }

    @Test(dataProvider = "importStatements")
    public void testGetImportStatementEscapesKeywordSegments(String orgName, String packageName, String moduleName) {
        String importStatement = CommonUtils.getImportStatement(orgName, packageName, moduleName);
        String modulePath = importStatement.contains("/")
                ? importStatement.substring(importStatement.indexOf('/') + 1)
                : importStatement;
        for (String segment : modulePath.split("\\.")) {
            assertSegmentSafe(segment);
        }
    }

    @DataProvider(name = "classTypes")
    public Object[][] classTypes() {
        return new Object[][]{
                // {packageName, clientName}
                {"hubspot.crm.import", "Client"}, // keyword terminal segment -> 'import:Client
                {"http", "Client"},               // clean
                {"x.type", "Client"},              // keyword terminal segment -> 'type:Client
        };
    }

    @Test(dataProvider = "classTypes")
    public void testGetClassTypeEscapesKeywordPrefix(String packageName, String clientName) {
        String classType = CommonUtils.getClassType(packageName, clientName);
        String prefix = classType.substring(0, classType.indexOf(':'));
        assertSegmentSafe(prefix);
    }

    /**
     * Asserts that a single identifier segment is a legal Ballerina identifier: a reserved keyword must be
     * escaped with a leading quote, and a non-keyword segment must not be over-escaped.
     */
    private static void assertSegmentSafe(String segment) {
        if (segment.startsWith("'")) {
            String raw = segment.substring(1);
            Assert.assertTrue(SyntaxInfo.isKeyword(raw),
                    "Segment '" + segment + "' is escaped but '" + raw + "' is not a reserved keyword");
        } else {
            Assert.assertFalse(SyntaxInfo.isKeyword(segment),
                    "Segment '" + segment + "' is a reserved keyword but was not escaped");
        }
    }
}
