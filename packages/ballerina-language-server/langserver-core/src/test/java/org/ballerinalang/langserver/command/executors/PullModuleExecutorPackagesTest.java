/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.langserver.command.executors;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import org.ballerinalang.central.client.exceptions.CentralClientException;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.command.executors.PullModuleExecutor.PackageCoordinate;
import org.ballerinalang.langserver.common.constants.CommandConstants;
import org.ballerinalang.langserver.commons.command.CommandArgument;
import org.ballerinalang.langserver.exception.UserErrorException;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * L1 tests for the exact-version pulls requested through {@link CommandConstants#ARG_KEY_PACKAGES}. The
 * Central download is replaced with a stub puller, so no network access is involved.
 */
public class PullModuleExecutorPackagesTest {

    private static final PackageCoordinate MCP = new PackageCoordinate("ballerina", "mcp", "1.2.0");
    private static final PackageCoordinate KAFKA = new PackageCoordinate("ballerinax", "kafka", "4.5.0");
    private static final PackageCoordinate RABBITMQ = new PackageCoordinate("ballerinax", "rabbitmq", "3.2.0");

    @Test(description = "The packages argument is parsed into package coordinates")
    public void testPackagesArgumentParsesCoordinates() {
        JsonArray value = new JsonArray();
        value.add(coordinateJson(MCP));
        value.add(coordinateJson(KAFKA));

        Assert.assertEquals(PullModuleExecutor.packagesArgument(argument(value)), List.of(MCP, KAFKA));
    }

    @Test(description = "A null packages argument is treated as no requested packages")
    public void testNullPackagesArgumentIsEmpty() {
        Assert.assertEquals(PullModuleExecutor.packagesArgument(argument(JsonNull.INSTANCE)), List.of());
    }

    @Test(description = "No requested packages pulls nothing")
    public void testNoPackagesPullsNothing() {
        PullModuleExecutor.PackagePuller puller = pkg -> Assert.fail("Unexpected pull of " + pkg.signature());

        PullModuleExecutor.pullRequestedPackages(List.of(), mockLogger(), puller);
    }

    @Test(description = "Every requested package is pulled once")
    public void testEveryPackageIsPulled() {
        Set<PackageCoordinate> pulled = ConcurrentHashMap.newKeySet();

        PullModuleExecutor.pullRequestedPackages(List.of(MCP, KAFKA), mockLogger(), pulled::add);

        Assert.assertEquals(pulled, Set.of(MCP, KAFKA));
    }

    @Test(description = "A failed pull reports every failed package and still attempts the others")
    public void testFailedPullsAreReported() {
        Set<PackageCoordinate> attempted = ConcurrentHashMap.newKeySet();
        LSClientLogger logger = mockLogger();
        PullModuleExecutor.PackagePuller puller = pkg -> {
            attempted.add(pkg);
            if (pkg.equals(KAFKA)) {
                throw new CentralClientException("package not found");
            }
            if (pkg.equals(RABBITMQ)) {
                throw new IllegalStateException("connection reset");
            }
        };

        UserErrorException error = Assert.expectThrows(UserErrorException.class,
                () -> PullModuleExecutor.pullRequestedPackages(List.of(MCP, KAFKA, RABBITMQ), logger, puller));

        Assert.assertEquals(attempted, Set.of(MCP, KAFKA, RABBITMQ));
        Assert.assertTrue(error.getMessage().contains("ballerinax/kafka:4.5.0"), error.getMessage());
        Assert.assertTrue(error.getMessage().contains("ballerinax/rabbitmq:3.2.0"), error.getMessage());
        Assert.assertFalse(error.getMessage().contains("ballerina/mcp:1.2.0"), error.getMessage());
        Mockito.verify(logger).logTrace(Mockito.contains("ballerinax/kafka:4.5.0': package not found"));
        Mockito.verify(logger).logTrace(Mockito.contains("ballerinax/rabbitmq:3.2.0': connection reset"));
    }

    private static CommandArgument argument(JsonElement value) {
        JsonObject arg = new JsonObject();
        arg.addProperty("key", CommandConstants.ARG_KEY_PACKAGES);
        arg.add("value", value);
        return CommandArgument.from(arg);
    }

    private static JsonObject coordinateJson(PackageCoordinate pkg) {
        JsonObject json = new JsonObject();
        json.addProperty("org", pkg.org());
        json.addProperty("name", pkg.name());
        json.addProperty("version", pkg.version());
        return json;
    }

    private static LSClientLogger mockLogger() {
        return Mockito.mock(LSClientLogger.class);
    }
}
