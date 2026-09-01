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
package io.ballerina.modelgenerator.commons.trigger;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.modelgenerator.commons.trigger.utils.TriggerUIAuthoringParser;
import org.testng.Assert;
import org.testng.annotations.Test;

/** Tests normalization of the flattened L2 authoring syntax at every promotion boundary. */
public class TriggerUIAuthoringParserTest {

    @Test
    public void flattenedSourceIsNormalizedAfterContextualPromotion() {
        JsonObject root = JsonParser.parseString("""
                {
                  "initForm": {"fields": [{"key": "init", "source": {"construct": {"kind": "FIELD"}}}]},
                  "listeners": [{"id": "listener", "formFields": {
                    "host": {"metadata": {"label": "Host"},
                      "source": {"module": {"name": "listener.module"}},
                      "choices": [{"key": "local", "metadata": {"label": "Local"}}],
                      "properties": {"port": {"placeholder": "Port"}}}
                  }}],
                  "serviceTypes": [{"id": "service", "properties": {
                    "path": {"source": {"value": {"kind": "LITERAL", "literal": "/"}}}
                  }, "handlers": [{"name": "onMessage", "properties": {
                    "enabled": {"default": true}
                  }, "parameters": [
                    {"key": "payload", "source": {"argument": {"kind": "PAYLOAD"}}}
                  ], "returnType": {"source": {"construct": {"kind": "FUNCTION_RETURN"}}}}]}]
                }
                """).getAsJsonObject();

        JsonObject normalized = TriggerUIAuthoringParser.normalize(root);

        Assert.assertEquals(normalized.getAsJsonObject("initForm").getAsJsonArray("fields")
                .get(0).getAsJsonObject().getAsJsonObject("field").getAsJsonObject("source")
                .getAsJsonObject("codedata")
                .get("type").getAsString(), "FIELD");
        Assert.assertEquals(normalized.getAsJsonArray("listeners").get(0).getAsJsonObject()
                .getAsJsonObject("listener").getAsJsonObject("formFields").getAsJsonObject("host")
                .getAsJsonObject("source").getAsJsonObject("codedata")
                .get("moduleName").getAsString(),
                "listener.module");
        JsonObject host = normalized.getAsJsonArray("listeners").get(0).getAsJsonObject()
                .getAsJsonObject("listener").getAsJsonObject("formFields").getAsJsonObject("host");
        Assert.assertEquals(host.getAsJsonObject("metadata").get("label").getAsString(), "Host");
        Assert.assertFalse(host.has("field"));
        Assert.assertEquals(host.getAsJsonArray("choices").get(0).getAsJsonObject()
                .get("key").getAsString(), "local");
        Assert.assertEquals(host.getAsJsonObject("properties").getAsJsonObject("port")
                .get("placeholder").getAsString(), "Port");
        JsonObject serviceType = normalized.getAsJsonArray("serviceTypes").get(0).getAsJsonObject();
        JsonObject service = serviceType
                .getAsJsonObject("service");
        Assert.assertEquals(service.getAsJsonObject("properties").getAsJsonObject("path")
                .getAsJsonObject("source").getAsJsonObject("codedata")
                .get("valueKind").getAsString(),
                "LITERAL");
        JsonObject handler = serviceType.getAsJsonArray("handlers").get(0).getAsJsonObject()
                .getAsJsonObject("function");
        JsonObject handlerRecord = serviceType.getAsJsonArray("handlers").get(0).getAsJsonObject();
        Assert.assertFalse(handler.getAsJsonObject("properties").getAsJsonObject("enabled").has("field"));
        Assert.assertEquals(handlerRecord.getAsJsonArray("parameters").get(0).getAsJsonObject()
                .getAsJsonObject("field").getAsJsonObject("source").getAsJsonObject("codedata")
                .get("argType").getAsString(), "PAYLOAD");
        Assert.assertEquals(handlerRecord.getAsJsonObject("returnType").getAsJsonObject("field")
                .getAsJsonObject("source").getAsJsonObject("codedata").get("type").getAsString(),
                "FUNCTION_RETURN");
    }
}
