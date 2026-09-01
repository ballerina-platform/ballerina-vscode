/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.servicemodelgenerator.extension;

import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.DriverDependency;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.HttpResponse;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.request.CommonModelFromSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.FunctionModelRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.FunctionModifierRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.FunctionSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ListenerDiscoveryRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ListenerModifierRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ListenerSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModelRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModifierRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.response.CommonSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.FunctionFromSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.FunctionModelResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ListenerDiscoveryResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ListenerFromSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceFromSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceModelResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.TriggerListResponse;
import io.ballerina.servicemodelgenerator.extension.util.Constants;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.BallerinaLanguageServer;
import org.ballerinalang.langserver.util.TestUtil;
import org.eclipse.lsp4j.DidCloseTextDocumentParams;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.Endpoint;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

public class ServiceModelAPITests {

    private Endpoint serviceEndpoint;
    private BallerinaLanguageServer languageServer;
    private Path resDir;

    @BeforeClass
    public void init() {
        this.languageServer = new BallerinaLanguageServer();
        TestUtil.LanguageServerBuilder builder = TestUtil.newLanguageServer().withLanguageServer(languageServer);
        this.serviceEndpoint = builder.build();
        resDir = Paths.get("src/test/resources/samples").toAbsolutePath();
    }

    @Test
    public void testListenerDiscoveryWithEmptyFile() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample1/main.bal");
        ListenerDiscoveryRequest request = new ListenerDiscoveryRequest(filePath.toAbsolutePath().toString(),
                "ballerina", "http");
        CompletableFuture<?> result = serviceEndpoint.request("serviceDesign/getListeners", request);
        ListenerDiscoveryResponse response = (ListenerDiscoveryResponse) result.get();
        Assert.assertTrue(response.hasListeners());
        Assert.assertEquals(response.listeners().size(), 1);
        Assert.assertTrue(response.listeners().contains(
                Constants.HTTP_DEFAULT_LISTENER_ITEM_LABEL));
    }

    @Test
    public void testListenerDiscoveryWithOneListener() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample8/main.bal");
        ListenerDiscoveryRequest request = new ListenerDiscoveryRequest(filePath.toAbsolutePath().toString(),
                "ballerina", "http");
        CompletableFuture<?> result = serviceEndpoint.request("serviceDesign/getListeners", request);
        ListenerDiscoveryResponse response = (ListenerDiscoveryResponse) result.get();
        Assert.assertTrue(response.hasListeners());
        Assert.assertEquals(response.listeners().size(), 2);
        Assert.assertTrue(response.listeners().contains(
                Constants.HTTP_DEFAULT_LISTENER_ITEM_LABEL));
        Assert.assertTrue(response.listeners().contains("httpDefaultListener"));
    }

    @Test(enabled = false)
    public void testListenerDiscovery() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample2/main.bal");
        ListenerDiscoveryRequest request = new ListenerDiscoveryRequest(filePath.toAbsolutePath().toString(),
                "ballerinax", "nats");
        CompletableFuture<?> result = serviceEndpoint.request("serviceDesign/getListeners", request);
        ListenerDiscoveryResponse response = (ListenerDiscoveryResponse) result.get();
        Assert.assertFalse(response.hasListeners());
        Assert.assertEquals(response.listeners().size(), 0);

        request = new ListenerDiscoveryRequest(filePath.toAbsolutePath().toString(),
                "ballerinax", "kafka");
        result = serviceEndpoint.request("serviceDesign/getListeners", request);
        response = (ListenerDiscoveryResponse) result.get();
        Assert.assertTrue(response.hasListeners());
        Assert.assertEquals(response.listeners().size(), 1);
        Assert.assertTrue(response.listeners().contains("kafkaListener"));

        request = new ListenerDiscoveryRequest(filePath.toAbsolutePath().toString(),
                "ballerinax", "http");
        result = serviceEndpoint.request("serviceDesign/getListeners", request);
        response = (ListenerDiscoveryResponse) result.get();
        Assert.assertTrue(response.hasListeners());
        Assert.assertEquals(response.listeners().size(), 3);
        Assert.assertTrue(response.listeners().contains("httpListener"));
        Assert.assertTrue(response.listeners().contains("githubListener"));
        Assert.assertTrue(response.listeners().contains("remoteEPListener"));

        request = new ListenerDiscoveryRequest(filePath.toAbsolutePath().toString(),
                "ballerinax", "kafka");
        result = serviceEndpoint.request("serviceDesign/getListeners", request);
        response = (ListenerDiscoveryResponse) result.get();
        Assert.assertTrue(response.hasListeners());
        Assert.assertEquals(response.listeners().size(), 1);
        Assert.assertTrue(response.listeners().contains("kafkaListener"));

        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testGetServiceModelWithoutListener() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample1/main.bal");
        ServiceModelRequest request = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerina",
                "http", null);
        CompletableFuture<?> result = serviceEndpoint.request("serviceDesign/getServiceModel", request);
        ServiceModelResponse response = (ServiceModelResponse) result.get();
        Assert.assertTrue(Objects.nonNull(response.service()));

        filePath = resDir.resolve("sample2/main.bal");
        request = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerina",
                "http", null);
        result = serviceEndpoint.request("serviceDesign/getServiceModel", request);
        response = (ServiceModelResponse) result.get();
        Assert.assertTrue(Objects.nonNull(response.service()));

        filePath = resDir.resolve("sample2/main.bal");
        request = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerinax",
                "kafka", null);
        result = serviceEndpoint.request("serviceDesign/getServiceModel", request);
        response = (ServiceModelResponse) result.get();
        Assert.assertTrue(Objects.nonNull(response.service()));
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testGetServiceModelWithListener() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample2/main.bal");
        ServiceModelRequest request = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerinax",
                "rabbitmq", "testListener");
        CompletableFuture<?> result = serviceEndpoint.request("serviceDesign/getServiceModel", request);
        ServiceModelResponse response = (ServiceModelResponse) result.get();
        Assert.assertTrue(Objects.nonNull(response.service()));
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testGetTriggerList() throws ExecutionException, InterruptedException {
        CompletableFuture<?> result = serviceEndpoint.request("serviceDesign/getTriggerModels", null);
        TriggerListResponse response = (TriggerListResponse) result.get();
        Assert.assertTrue(Objects.nonNull(response.local()));
        Assert.assertFalse(response.local().isEmpty());
    }

    @Test
    public void testAddHttpService() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample2/main.bal");
        ServiceModelRequest modelRequest = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerina",
                "http", null);
        CompletableFuture<?> modelResult = serviceEndpoint.request("serviceDesign/getServiceModel", modelRequest);
        ServiceModelResponse modelResponse = (ServiceModelResponse) modelResult.get();
        Service service = modelResponse.service();
        Assert.assertTrue(Objects.nonNull(service));
        service.getListener().setValues(List.of("default:httpListener", "httpsTestListener"));
        Value designApproach = service.getDesignApproach();
        Value selectedApproach = designApproach.getChoices().getFirst();
        Value basePath = selectedApproach.getProperty("basePath");
        basePath.setValue("/api/test");
        basePath.setEnabled(true);
        selectedApproach.setEnabled(true);

        ServiceSourceRequest sourceRequest = new ServiceSourceRequest(filePath.toAbsolutePath().toString(), service);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/addService", sourceRequest);
        CommonSourceResponse sourceResponse = (CommonSourceResponse) sourceResult.get();
        Assert.assertTrue(Objects.nonNull(sourceResponse.textEdits()));
        Assert.assertFalse(sourceResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testAddBallerinaAiService() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample9/main.bal");
        ServiceModelRequest modelRequest = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerina",
                "ai", null);
        CompletableFuture<?> modelResult = serviceEndpoint.request("serviceDesign/getServiceModel", modelRequest);
        ServiceModelResponse modelResponse = (ServiceModelResponse) modelResult.get();
        Service service = modelResponse.service();
        Assert.assertTrue(Objects.nonNull(service));
        service.getListener().setValues(List.of("aiListener"));

        ServiceSourceRequest sourceRequest = new ServiceSourceRequest(filePath.toAbsolutePath().toString(), service);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/addService", sourceRequest);
        CommonSourceResponse sourceResponse = (CommonSourceResponse) sourceResult.get();
        Assert.assertTrue(Objects.nonNull(sourceResponse.textEdits()));
        Assert.assertFalse(sourceResponse.textEdits().isEmpty());

        List<TextEdit> textEdits = sourceResponse.textEdits().entrySet().stream().findFirst().get().getValue();
        Assert.assertEquals(textEdits.size(), 2);
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testAddBallerinaXAiService() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample9/main.bal");
        ServiceModelRequest modelRequest = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerinax",
                "ai", null);
        CompletableFuture<?> modelResult = serviceEndpoint.request("serviceDesign/getServiceModel", modelRequest);
        ServiceModelResponse modelResponse = (ServiceModelResponse) modelResult.get();
        Service service = modelResponse.service();
        Assert.assertTrue(Objects.nonNull(service));
        service.getListener().setValues(List.of("aiListener"));

        ServiceSourceRequest sourceRequest = new ServiceSourceRequest(filePath.toAbsolutePath().toString(), service);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/addService", sourceRequest);
        CommonSourceResponse sourceResponse = (CommonSourceResponse) sourceResult.get();
        Assert.assertTrue(Objects.nonNull(sourceResponse.textEdits()));
        Assert.assertFalse(sourceResponse.textEdits().isEmpty());

        List<TextEdit> textEdits = sourceResponse.textEdits().entrySet().stream().findFirst().get().getValue();
        Assert.assertEquals(textEdits.size(), 2);
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testAddHttpServiceWithContract() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample5/main.bal");
        ServiceModelRequest modelRequest = new ServiceModelRequest(filePath.toAbsolutePath().toString(), "ballerina",
                "http", null);
        CompletableFuture<?> modelResult = serviceEndpoint.request("serviceDesign/getServiceModel", modelRequest);
        ServiceModelResponse modelResponse = (ServiceModelResponse) modelResult.get();
        Service service = modelResponse.service();
        Assert.assertTrue(Objects.nonNull(service));
        service.getListener().setValues(List.of("httpListener", "httpsListener"));
        Value designApproach = service.getDesignApproach();
        designApproach.getChoices().getFirst().setEnabled(false);
        Value selectedApproach = designApproach.getChoices().get(1);
        Value serviceTypeName = selectedApproach.getProperty("serviceTypeName");
        serviceTypeName.setValue("AlbumsService");
        serviceTypeName.setEnabled(true);
        Value contractPath = selectedApproach.getProperty("spec");
        contractPath.setValue(resDir.resolve("sample5/openapi.yaml").toAbsolutePath().toString());
        contractPath.setEnabled(true);
        selectedApproach.setEnabled(true);

        ServiceSourceRequest sourceRequest = new ServiceSourceRequest(filePath.toAbsolutePath().toString(), service);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/addService", sourceRequest);
        CommonSourceResponse sourceResponse = (CommonSourceResponse) sourceResult.get();
        Assert.assertTrue(Objects.nonNull(sourceResponse.textEdits()));
        Assert.assertFalse(sourceResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testAddHttpResource() throws ExecutionException, InterruptedException {
        FunctionModelRequest request = new FunctionModelRequest("http", "resource");
        CompletableFuture<?> modelResult = serviceEndpoint.request("serviceDesign/getFunctionModel", request);
        FunctionModelResponse modelResponse = (FunctionModelResponse) modelResult.get();

        Function resource = modelResponse.function();
        resource.getAccessor().setValue("POST");
        resource.getName().setValue("test/[string name]/api");

        Parameter query = resource.getSchema().get("query");
        query.setEnabled(true);
        query.getName().setValue("id");
        query.getType().setValue("int");
        resource.addParameter(query);

        Parameter payload = resource.getSchema().get("payload");
        payload.setEnabled(true);
        payload.getName().setValue("body");
        payload.getType().setValue("map<json>");
        resource.addParameter(payload);

        Parameter header = resource.getSchema().get("header");
        header.setEnabled(true);
        header.getName().setValue("header");
        header.getType().setValue("string");
        header.getDefaultValue().setEnabled(true);
        header.getDefaultValue().setValue("\"test\"");
        resource.addParameter(header);

        HttpResponse response = new HttpResponse("201", "json", "Created");
        resource.getReturnType().setResponses(List.of(response));
        resource.getReturnType().setEnabled(true);

        Path filePath = resDir.resolve("sample3/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(7, 0),
                LinePosition.from(21, 1)));
        FunctionSourceRequest sourceRequest = new FunctionSourceRequest(filePath.toAbsolutePath().toString(),
                resource, codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/addResource", sourceRequest);
        CommonSourceResponse sourceResponse = (CommonSourceResponse) sourceResult.get();
        Assert.assertTrue(Objects.nonNull(sourceResponse.textEdits()));
        Assert.assertFalse(sourceResponse.textEdits().isEmpty());
    }

    @Test
    public void testGetHttpServiceFromSource() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample3/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(7, 0),
                LinePosition.from(21, 1)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getServiceFromSource",
                sourceRequest);
        ServiceFromSourceResponse sourceResponse = (ServiceFromSourceResponse) sourceResult.get();
        Service service = sourceResponse.service();
        Assert.assertTrue(Objects.nonNull(service));

        ServiceSourceRequest genRequest = new ServiceSourceRequest(filePath.toAbsolutePath().toString(), service);
        CompletableFuture<?> genResult = serviceEndpoint.request("serviceDesign/addService", genRequest);
        CommonSourceResponse genResponse = (CommonSourceResponse) genResult.get();
        Assert.assertTrue(Objects.nonNull(genResponse.textEdits()));
        Assert.assertFalse(genResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testGetHttpContractServiceFromSource() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample6/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(7, 0),
                LinePosition.from(21, 1)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getServiceFromSource",
                sourceRequest);
        ServiceFromSourceResponse sourceResponse = (ServiceFromSourceResponse) sourceResult.get();
        Service service = sourceResponse.service();
        Assert.assertTrue(Objects.nonNull(service));

        ServiceSourceRequest genRequest = new ServiceSourceRequest(filePath.toAbsolutePath().toString(), service);
        CompletableFuture<?> genResult = serviceEndpoint.request("serviceDesign/addService", genRequest);
        CommonSourceResponse genResponse = (CommonSourceResponse) genResult.get();
        Assert.assertTrue(Objects.nonNull(genResponse.textEdits()));
        Assert.assertFalse(genResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testGetHttpListenerFromSource() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample3/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(5, 23),
                LinePosition.from(5, 37)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getListenerFromSource",
                sourceRequest);
        ListenerFromSourceResponse sourceResponse = (ListenerFromSourceResponse) sourceResult.get();
        Listener listener = sourceResponse.listener();
        Assert.assertTrue(Objects.nonNull(listener));

        ListenerSourceRequest genRequest = new ListenerSourceRequest(filePath.toAbsolutePath().toString(), listener);
        CompletableFuture<?> genResult = serviceEndpoint.request("serviceDesign/addListener", genRequest);
        CommonSourceResponse genResponse = (CommonSourceResponse) genResult.get();
        Assert.assertTrue(Objects.nonNull(genResponse.textEdits()));
        Assert.assertFalse(genResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    /**
     * Regression for the create-new-listener driver-dependency flow (product-integrator#2020):
     * {@code addListener} must turn a filled {@code driverDependency} field (e.g. a SAP JCo JAR the
     * user picked) into a {@code [[platform.java21.dependency]]} Ballerina.toml edit, alongside the
     * listener declaration edit.
     */
    @Test
    public void testAddListenerWritesDriverDependencyEdit() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample1/main.bal");

        Codedata driverCodedata = new Codedata();
        driverCodedata.setDriverDependency(new DriverDependency("com.sap", "com.sap.conn.jco", "3.1.*",
                "provided"));
        Value sapJcoDriverPath = new Value.ValueBuilder()
                .value("libs/sapjco3.jar")
                .enabled(true)
                .editable(true)
                .setCodedata(driverCodedata)
                .build();
        Value listenerType = new Value.ValueBuilder().value("Listener").enabled(true).editable(true).build();

        Map<String, Value> properties = new LinkedHashMap<>();
        properties.put(Constants.PROP_KEY_LISTENER_TYPE, listenerType);
        properties.put("sapJcoDriverPath", sapJcoDriverPath);

        Listener listener = new Listener.ListenerBuilder()
                .setModuleName("sap.jco")
                .setOrgName("ballerinax")
                .setVersion("2.0.1")
                .setListenerProtocol("sapJco")
                .setProperties(properties)
                .build();

        ListenerSourceRequest genRequest = new ListenerSourceRequest(filePath.toAbsolutePath().toString(), listener);
        CompletableFuture<?> genResult = serviceEndpoint.request("serviceDesign/addListener", genRequest);
        CommonSourceResponse genResponse = (CommonSourceResponse) genResult.get();
        Assert.assertTrue(Objects.nonNull(genResponse.textEdits()));

        boolean tomlEditPresent = genResponse.textEdits().values().stream()
                .flatMap(List::stream)
                .anyMatch(edit -> edit.getNewText().contains("[[platform.java21.dependency]]")
                        && edit.getNewText().contains("path = \"libs/sapjco3.jar\"")
                        && edit.getNewText().contains("groupId = \"com.sap\"")
                        && edit.getNewText().contains("artifactId = \"com.sap.conn.jco\"")
                        && edit.getNewText().contains("scope = \"provided\""));
        Assert.assertTrue(tomlEditPresent,
                "addListener must write the [[platform.java21.dependency]] edit for a driver-dependency "
                        + "field the user filled in");
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test(enabled = false)
    public void testGetTriggerServiceFromSource() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample4/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(4, 0),
                LinePosition.from(53, 1)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getServiceFromSource",
                sourceRequest);
        ServiceFromSourceResponse sourceResponse = (ServiceFromSourceResponse) sourceResult.get();
        Service service = sourceResponse.service();
        Assert.assertTrue(Objects.nonNull(service));

        ServiceSourceRequest genRequest = new ServiceSourceRequest(filePath.toAbsolutePath().toString(), service);
        CompletableFuture<?> genResult = serviceEndpoint.request("serviceDesign/addService", genRequest);
        CommonSourceResponse genResponse = (CommonSourceResponse) genResult.get();
        Assert.assertTrue(Objects.nonNull(genResponse.textEdits()));
        Assert.assertFalse(genResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test(enabled = false)
    public void testGetTriggerListenerFromSource() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample4/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(2, 0),
                LinePosition.from(2, 112)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getListenerFromSource",
                sourceRequest);
        ListenerFromSourceResponse sourceResponse = (ListenerFromSourceResponse) sourceResult.get();
        Listener listener = sourceResponse.listener();
        Assert.assertTrue(Objects.nonNull(listener));

        ListenerSourceRequest genRequest = new ListenerSourceRequest(filePath.toAbsolutePath().toString(), listener);
        CompletableFuture<?> genResult = serviceEndpoint.request("serviceDesign/addListener", genRequest);
        CommonSourceResponse genResponse = (CommonSourceResponse) genResult.get();
        Assert.assertTrue(Objects.nonNull(genResponse.textEdits()));
        Assert.assertFalse(genResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test(enabled = false)
    public void testAddTriggerFunction() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample7/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(4, 0),
                LinePosition.from(11, 1)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getServiceFromSource",
                sourceRequest);
        ServiceFromSourceResponse sourceResponse = (ServiceFromSourceResponse) sourceResult.get();
        Service service = sourceResponse.service();
        Assert.assertTrue(Objects.nonNull(service));

        Function onErrorFunction = service.getFunctions().get(1);
        onErrorFunction.setEnabled(true);

        FunctionSourceRequest request = new FunctionSourceRequest(filePath.toAbsolutePath().toString(),
                onErrorFunction, codedata);
        CompletableFuture<?> result = serviceEndpoint.request("serviceDesign/addFunction", request);
        CommonSourceResponse response = (CommonSourceResponse) result.get();
        Assert.assertTrue(Objects.nonNull(response.textEdits()));
        Assert.assertFalse(response.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testUpdateHttpListener() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample3/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(5, 0),
                LinePosition.from(5, 56)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getListenerFromSource",
                sourceRequest);
        ListenerFromSourceResponse sourceResponse = (ListenerFromSourceResponse) sourceResult.get();
        Listener listener = sourceResponse.listener();
        Assert.assertTrue(Objects.nonNull(listener));
        Value name = listener.getVariableNameProperty();
        name.setValue("newHttpListener");
        Value port = listener.getProperty("port");
        port.setValue("8080");
        Value version = listener.getProperty("httpVersion");
        version.setEnabled(false);

        ListenerModifierRequest updateRequest = new ListenerModifierRequest(filePath.toAbsolutePath().toString(),
                listener);
        CompletableFuture<?> updateResult = serviceEndpoint.request("serviceDesign/updateListener", updateRequest);
        CommonSourceResponse updateResponse = (CommonSourceResponse) updateResult.get();
        Assert.assertTrue(Objects.nonNull(updateResponse.textEdits()));
        Assert.assertFalse(updateResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    /**
     * Regression for {@code updateListener}'s driver-dependency wiring (product-integrator#2020):
     * a filled {@code driverDependency} field on the edited listener's properties must still turn
     * into a {@code [[platform.java21.dependency]]} Ballerina.toml edit, alongside the listener's own
     * declaration edit.
     */
    @Test
    public void testUpdateListenerWritesDriverDependencyEdit() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample3/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(5, 0),
                LinePosition.from(5, 56)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getListenerFromSource",
                sourceRequest);
        ListenerFromSourceResponse sourceResponse = (ListenerFromSourceResponse) sourceResult.get();
        Listener listener = sourceResponse.listener();
        Assert.assertTrue(Objects.nonNull(listener));

        Codedata driverCodedata = new Codedata();
        driverCodedata.setDriverDependency(new DriverDependency("com.sap", "com.sap.conn.jco", "3.1.*",
                "provided"));
        Value sapJcoDriverPath = new Value.ValueBuilder()
                .value("libs/sapjco3.jar")
                .enabled(true)
                .editable(true)
                .setCodedata(driverCodedata)
                .build();
        listener.getProperties().put("sapJcoDriverPath", sapJcoDriverPath);

        ListenerModifierRequest updateRequest = new ListenerModifierRequest(filePath.toAbsolutePath().toString(),
                listener);
        CompletableFuture<?> updateResult = serviceEndpoint.request("serviceDesign/updateListener", updateRequest);
        CommonSourceResponse updateResponse = (CommonSourceResponse) updateResult.get();
        Assert.assertTrue(Objects.nonNull(updateResponse.textEdits()));

        boolean tomlEditPresent = updateResponse.textEdits().values().stream()
                .flatMap(List::stream)
                .anyMatch(edit -> edit.getNewText().contains("[[platform.java21.dependency]]")
                        && edit.getNewText().contains("path = \"libs/sapjco3.jar\"")
                        && edit.getNewText().contains("groupId = \"com.sap\"")
                        && edit.getNewText().contains("artifactId = \"com.sap.conn.jco\"")
                        && edit.getNewText().contains("scope = \"provided\""));
        Assert.assertTrue(tomlEditPresent,
                "updateListener must write the [[platform.java21.dependency]] edit for a driver-dependency "
                        + "field the user filled in");
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testUpdateHttpService() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample3/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(7, 0),
                LinePosition.from(21, 1)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getServiceFromSource",
                sourceRequest);
        ServiceFromSourceResponse sourceResponse = (ServiceFromSourceResponse) sourceResult.get();
        Service service = sourceResponse.service();
        Assert.assertTrue(Objects.nonNull(service));
        service.getListener().setValues(List.of("newHttpListener", "default:httpListener"));
        service.getBasePath().setValue("/api/v1/test/new");

        ServiceModifierRequest updateRequest = new ServiceModifierRequest(filePath.toAbsolutePath().toString(),
                service);
        CompletableFuture<?> updateResult = serviceEndpoint.request("serviceDesign/updateService", updateRequest);
        CommonSourceResponse updateResponse = (CommonSourceResponse) updateResult.get();
        Assert.assertTrue(Objects.nonNull(updateResponse.textEdits()));
        Assert.assertFalse(updateResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @Test
    public void testUpdateFunction() throws ExecutionException, InterruptedException {
        Path filePath = resDir.resolve("sample3/main.bal");
        Codedata codedata = new Codedata(LineRange.from("main.bal", LinePosition.from(15, 4),
                LinePosition.from(20, 5)));
        CommonModelFromSourceRequest sourceRequest = new CommonModelFromSourceRequest(
                filePath.toAbsolutePath().toString(), codedata);
        CompletableFuture<?> sourceResult = serviceEndpoint.request("serviceDesign/getFunctionFromSource",
                sourceRequest);
        FunctionFromSourceResponse sourceResponse = (FunctionFromSourceResponse) sourceResult.get();
        Function function = sourceResponse.function();
        Assert.assertTrue(Objects.nonNull(function));
        function.getAccessor().setValue("put");
        function.getReturnType().setValue("");
        List<HttpResponse> responses = function.getReturnType().getResponses();

        HttpResponse response1 = new HttpResponse("204", "map<int>", "NoContent");
        responses.add(response1);

        HttpResponse response2 = new HttpResponse("map<string>");
        responses.add(response2);

        FunctionModifierRequest updateRequest = new FunctionModifierRequest(filePath.toAbsolutePath().toString(),
                function);
        CompletableFuture<?> updateResult = serviceEndpoint.request("serviceDesign/updateFunction", updateRequest);
        CommonSourceResponse updateResponse = (CommonSourceResponse) updateResult.get();
        Assert.assertTrue(Objects.nonNull(updateResponse.textEdits()));
        Assert.assertFalse(updateResponse.textEdits().isEmpty());
        serviceEndpoint.notify("textDocument/didClose",
                new DidCloseTextDocumentParams(new TextDocumentIdentifier(filePath.toUri().toString())));
    }

    @AfterMethod
    public void restartLanguageServer() {
        this.startLanguageServer();
        this.init();
    }

    private void startLanguageServer() {
        this.languageServer.shutdown();
        this.languageServer = null;
        this.serviceEndpoint = null;
    }

    @AfterClass
    public void cleanupLanguageServer() {
        this.languageServer.shutdown();
        this.languageServer = null;
        this.serviceEndpoint = null;
    }
}
