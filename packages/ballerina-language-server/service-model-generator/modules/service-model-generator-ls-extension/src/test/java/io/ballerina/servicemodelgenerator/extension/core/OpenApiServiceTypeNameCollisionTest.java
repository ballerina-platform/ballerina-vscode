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
package io.ballerina.servicemodelgenerator.extension.core;

import io.ballerina.openapi.core.generators.common.exception.BallerinaOpenApiException;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Tests the generator's own guard against a service type name that collides with a generated schema type,
 * for callers that do not go through the service-model validation gate.
 */
public class OpenApiServiceTypeNameCollisionTest {

    @Test
    public void testRejectsDuplicateTypeDeclaration() {
        String source = """
                public type Weather service object {};

                public type Weather record {|
                    string city;
                |};
                """;

        BallerinaOpenApiException exception = Assert.expectThrows(BallerinaOpenApiException.class,
                () -> OpenApiServiceGenerator.rejectGeneratedTypeNameCollision(source, "Weather"));
        Assert.assertEquals(exception.getMessage(),
                "Service type name 'Weather' conflicts with a type generated from the OpenAPI specification");
    }

    @Test
    public void testAcceptsSingleTypeDeclaration() throws BallerinaOpenApiException {
        String source = """
                public type WeatherService service object {};

                public type Weather record {|
                    string city;
                |};

                function helper() {}
                """;

        OpenApiServiceGenerator.rejectGeneratedTypeNameCollision(source, "WeatherService");
    }
}
