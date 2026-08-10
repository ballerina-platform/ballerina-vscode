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
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Direct unit tests for {@link FunctionBadge#stamp}.
 *
 * @since 1.9.0
 */
public class FunctionBadgeTest {

    @Test
    public void testInitFunctionGetsInitBadge() {
        Function init = functionOf("init", "DEFAULT", null);
        Service service = serviceOf("ftp", init);

        FunctionBadge.stamp(service);

        Assert.assertEquals(init.getMetadata().badge(), "INIT");
    }

    @Test
    public void testHttpResourceGetsItsAccessorAsBadge() {
        Function get = functionOf("path", "RESOURCE", "get");
        Service service = serviceOf("http", get);

        FunctionBadge.stamp(service);

        Assert.assertEquals(get.getMetadata().badge(), "GET",
                "an HTTP resource's badge must be its uppercased accessor method");
    }

    @Test
    public void testNonHttpResourceDoesNotGetAccessorBadge() {
        // The RESOURCE->accessor mapping is HTTP-specific; a non-HTTP service must not get one, even
        // if some other connector's function happened to carry a RESOURCE kind + accessor.
        Function resource = functionOf("path", "RESOURCE", "get");
        Service service = serviceOf("graphql", resource);

        FunctionBadge.stamp(service);

        Assert.assertNull(resource.getMetadata() == null ? null : resource.getMetadata().badge());
    }

    @Test
    public void testMcpRemoteFunctionGetsToolBadge() {
        Function tool = functionOf("newTool", "REMOTE", null);
        Service service = serviceOf("mcp", tool);

        FunctionBadge.stamp(service);

        Assert.assertEquals(tool.getMetadata().badge(), "Tool");
    }

    @Test
    public void testNonMcpRemoteFunctionGetsNoBadge() {
        // A plain event handler (e.g. RabbitMQ's onMessage) is REMOTE too, but only MCP's remote
        // methods are "tools" -- everything else is left without a badge so the front end applies its
        // own "Event" default.
        Function onMessage = functionOf("onMessage", "REMOTE", null);
        Service service = serviceOf("rabbitmq", onMessage);

        FunctionBadge.stamp(service);

        Assert.assertNull(onMessage.getMetadata() == null ? null : onMessage.getMetadata().badge());
    }

    @Test
    public void testDefaultKindGetsFuncBadge() {
        Function plain = functionOf("someMethod", "DEFAULT", null);
        Service service = serviceOf("ftp", plain);

        FunctionBadge.stamp(service);

        Assert.assertEquals(plain.getMetadata().badge(), "FUNC");
    }

    @Test
    public void testExistingBadgeIsNeverOverwritten() {
        // Trigger handlers carry their own badge straight from the trigger model JSON (e.g. ftp's
        // onCreate/onDelete/onError); stamp() must leave those alone.
        Function handler = functionOf("onCreate", "REMOTE", null);
        handler.setMetadata(new MetaData("On Create", "desc", null, null, "onCreate"));
        Service service = serviceOf("ftp", handler);

        FunctionBadge.stamp(service);

        Assert.assertEquals(handler.getMetadata().badge(), "onCreate", "an already-stamped badge must survive");
    }

    @Test
    public void testExistingMetadataFieldsSurviveStamping() {
        Function init = functionOf("init", "DEFAULT", null);
        init.setMetadata(new MetaData("Init", "Initializes the listener", "a notice", "an-icon", null));
        Service service = serviceOf("ftp", init);

        FunctionBadge.stamp(service);

        MetaData metadata = init.getMetadata();
        Assert.assertEquals(metadata.badge(), "INIT");
        Assert.assertEquals(metadata.label(), "Init", "stamping a badge must not clobber the existing label");
        Assert.assertEquals(metadata.description(), "Initializes the listener");
        Assert.assertEquals(metadata.notice(), "a notice");
        Assert.assertEquals(metadata.icon(), "an-icon");
    }

    @Test
    public void testNullServiceAndNullFunctionsAreNoOps() {
        FunctionBadge.stamp(null);
        Service noFunctions = new Service.ServiceModelBuilder().build();
        FunctionBadge.stamp(noFunctions); // must not throw
    }

    private static Function functionOf(String name, String kind, String accessor) {
        Function.FunctionBuilder builder = new Function.FunctionBuilder()
                .kind(kind)
                .name(new Value.ValueBuilder().value(name).build());
        if (accessor != null) {
            builder.accessor(new Value.ValueBuilder().value(accessor).build());
        }
        return builder.build();
    }

    private static Service serviceOf(String moduleName, Function... functions) {
        Service service = new Service.ServiceModelBuilder()
                .setModuleName(moduleName)
                .build();
        List<Function> functionList = new ArrayList<>(List.of(functions));
        service.setFunctions(functionList);
        return service;
    }
}
