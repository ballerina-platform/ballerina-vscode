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

package io.ballerina.flowmodelgenerator.extension;

import io.ballerina.modelgenerator.commons.AbstractLSTest;

/**
 * Tests for the undebounced expression check, which must give the same results as the diagnostics service.
 *
 * @since 1.0.0
 */
public class ExpressionEditorCheckExpressionTest extends ExpressionEditorDiagnosticsTest {

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ExpressionEditorCheckExpressionTest.class;
    }

    @Override
    protected String getApiName() {
        return "checkExpression";
    }

    @Override
    protected boolean debounced() {
        return false;
    }
}
