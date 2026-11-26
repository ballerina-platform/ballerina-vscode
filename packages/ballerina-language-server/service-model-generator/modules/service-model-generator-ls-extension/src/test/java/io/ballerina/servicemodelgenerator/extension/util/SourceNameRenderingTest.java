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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.HttpResponse;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;

/**
 * Tests that names typed in plain form are written consistently in the parts of a function that repeat them:
 * the parameter documentation and the HTTP header annotation.
 *
 * @since 1.7.0
 */
public class SourceNameRenderingTest {

    @Test
    public void testParameterDocumentationUsesTheSourceName() {
        // The signature writes `line\-item`; the documented name must match it, or the doc parser reads `line`
        Function function = new Function.FunctionBuilder()
                .parameters(List.of(documentedParameter("line-item"), documentedParameter("type"),
                        documentedParameter("id")))
                .build();

        // Lines are joined with the platform line separator, as the generated source is
        Assert.assertEquals(Utils.getDocumentationEdits(function), String.join(NEW_LINE, "",
                "# + line\\-item - The parameter", "# + 'type - The parameter", "# + id - The parameter"));
    }

    @Test
    public void testHeaderRemapComparesTheWireName() {
        // A parameter named `x\-api\-key` reads the header `x-api-key` without a remap
        Assert.assertEquals(headerPrefix("x\\-api\\-key", "x-api-key"), "@http:Header ");
        Assert.assertEquals(headerPrefix("x-api-key", "x-api-key"), "@http:Header ");
        // The header name is a wire name, not an identifier: `'foo` is a different header from `foo`
        Assert.assertEquals(headerPrefix("foo", "'foo"), "@http:Header {name: \"'foo\"} ");
        Assert.assertEquals(headerPrefix("apiKey", "x-api-key"), "@http:Header {name: \"x-api-key\"} ");
    }

    @Test
    public void testResponseHeaderFieldUsesTheSourceName() {
        Value headers = new Value.ValueBuilder().value("").enabled(true).build();
        headers.setValues(List.of(Map.of("name", "x-reason", "type", "string", "optional", "false"),
                Map.of("name", "type", "type", "string", "optional", "true")));
        HttpResponse response = new HttpResponse(value("404"), null, null, null, value(""), headers, true, true);

        String type = HttpUtil.getStatusCodeResponse(response, new ArrayList<>(), new HashMap<>(), new HashMap<>(),
                201);

        Assert.assertTrue(type.contains("string x\\-reason;"), type);
        Assert.assertTrue(type.contains("string 'type?;"), type);
    }

    private static Parameter documentedParameter(String name) {
        return new Parameter.Builder()
                .name(value(name))
                .documentation(value("The parameter"))
                .enabled(true)
                .build();
    }

    private static String headerPrefix(String paramName, String headerName) {
        Parameter parameter = new Parameter.Builder()
                .name(value(paramName))
                .headerName(value(headerName))
                .httpParamType(Constants.HTTP_PARAM_TYPE_HEADER)
                .enabled(true)
                .build();
        return Utils.buildHttpHeaderAnnotationPrefix(parameter, new HashMap<>());
    }

    private static Value value(String value) {
        return new Value.ValueBuilder().value(value).enabled(true).build();
    }
}
