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
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package io.ballerina.servicemodelgenerator.extension.validation;

import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URISyntaxException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Regression tests for OpenAPI service contract type-name validation. */
public class OpenApiServiceTypeNameValidatorTest {

    private static final Path ISSUE_395_SPEC = specPath();

    @Test
    public void testRejectsServiceTypeNameThatMatchesGeneratedSchema() {
        List<ValidationResult> results = OpenApiServiceTypeNameValidator.validate(
                model("Weather"));

        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().propertyPath(), "designApproach.choices.0.serviceTypeName");
        Assert.assertEquals(results.getFirst().rule(), OpenApiServiceTypeNameValidator.RULE);
        Assert.assertEquals(results.getFirst().message(),
                "Service type name 'Weather' conflicts with a type generated from the OpenAPI specification");
        Assert.assertEquals(results.getFirst().severity(), ValidationSeverity.ERROR);
    }

    @Test
    public void testRejectsServiceTypeNameThatMatchesNormalizedSchemaName() {
        List<ValidationResult> results = OpenApiServiceTypeNameValidator.validate(model("WeatherData"));

        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().message(),
                "Service type name 'WeatherData' conflicts with a type generated from the OpenAPI specification");
    }

    @Test
    public void testAcceptsServiceTypeNameThatDoesNotMatchGeneratedSchema() {
        Assert.assertTrue(OpenApiServiceTypeNameValidator.validate(model("WeatherService")).isEmpty());
    }

    private static ServiceInitModel model(String serviceTypeName) {
        Value spec = value(ISSUE_395_SPEC.toString());
        Value typeName = value(serviceTypeName);
        Map<String, Value> choiceProperties = new HashMap<>();
        choiceProperties.put("spec", spec);
        choiceProperties.put("serviceTypeName", typeName);

        Value openApiChoice = new Value.ValueBuilder()
                .setProperties(choiceProperties)
                .enabled(true)
                .editable(true)
                .build();
        Value designApproach = new Value.ValueBuilder()
                .enabled(true)
                .editable(true)
                .build();
        designApproach.setChoices(List.of(openApiChoice));

        ServiceInitModel model = new ServiceInitModel.Builder()
                .setModuleName("http")
                .build();
        model.addProperty("designApproach", designApproach);
        return model;
    }

    private static Value value(String value) {
        return new Value.ValueBuilder()
                .value(value)
                .enabled(true)
                .editable(true)
                .types(List.of(new PropertyType.Builder()
                        .fieldType(Value.FieldType.TEXT)
                        .selected(true)
                        .build()))
                .build();
    }

    private static Path specPath() {
        try {
            return Path.of(OpenApiServiceTypeNameValidatorTest.class.getResource("/validation/issue-395-openapi.yaml")
                    .toURI()).toAbsolutePath();
        } catch (URISyntaxException | NullPointerException e) {
            throw new IllegalStateException("Unable to load the issue-395 OpenAPI fixture", e);
        }
    }
}
