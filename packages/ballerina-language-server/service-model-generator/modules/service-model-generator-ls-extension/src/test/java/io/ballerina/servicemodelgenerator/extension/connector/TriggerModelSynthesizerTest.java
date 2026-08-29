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

package io.ballerina.servicemodelgenerator.extension.connector;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import io.ballerina.modelgenerator.commons.trigger.models.IdentifierSpec;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.PropertyTypeMemberInfo;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_VARIABLE_NAME;

/**
 * Unit test for {@link TriggerModelSynthesizer}. Per direct product feedback, the synthesizer no
 * longer builds listener init-param widgets itself -- it looks each one up, by name, from a
 * {@link Listener} model shaped exactly like what {@code ListenerUtil#getListenerModelByName} already
 * produces (records/unions/numbers all correctly widget-typed there), and only enriches its codedata
 * (argType/position) using the lightweight structural facts {@link TriggerLibraryFacts.Listener}
 * supplies. These tests hand-build such a {@code Listener} model (mirroring exactly what that utility
 * would resolve for the Phase-B fixture connector's {@code Listener(host, port = 9092,
 * *ConsumerConfig config)}) rather than exercising the utility itself (which needs a live compiled
 * {@code SemanticModel}) -- that utility's own correctness is out of scope here; this test only
 * verifies the synthesizer's structural enrichment and its handoff into the *real*
 * {@link SchemaDrivenSourceGenerator}, the same acceptance bar {@link TriggerSourceGenerationTest}
 * uses for hand-authored/bundled models.
 *
 * @since 1.10.0
 */
public class TriggerModelSynthesizerTest {

    private static final String MODULE = "triggerfixture";
    private static final Gson GSON = new Gson();

    // ---- Listener model construction helpers (mirror ListenerUtil.getListenerModelByName's output shape) ----

    private static Value textValue(String ballerinaType) {
        return new Value.ValueBuilder()
                .setMetadata(new MetaData("Label", "Description"))
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.TEXT, ballerinaType),
                        PropertyType.types(Value.FieldType.EXPRESSION, ballerinaType)))
                .enabled(true).editable(true).optional(false).setAdvanced(false)
                .build();
    }

    private static Value numberValue(String ballerinaType, String expressionType, boolean optional) {
        return new Value.ValueBuilder()
                .setMetadata(new MetaData("Label", "Description"))
                .value("")
                .types(List.of(PropertyType.types(Value.FieldType.NUMBER, ballerinaType),
                        PropertyType.types(Value.FieldType.EXPRESSION, expressionType)))
                .enabled(true).editable(true).optional(optional).setAdvanced(false)
                .build();
    }

    private static Value recordValue(String simpleTypeName, String ballerinaType, String packageInfo,
                                     String packageName, String value, boolean optional) {
        PropertyType recordType = new PropertyType.Builder()
                .fieldType(Value.FieldType.RECORD_MAP_EXPRESSION)
                .ballerinaType(ballerinaType)
                .typeMembers(List.of(new PropertyTypeMemberInfo(simpleTypeName, packageInfo, packageName,
                        "RECORD_TYPE", false)))
                .selected(true)
                .build();
        PropertyType expressionType = PropertyType.types(Value.FieldType.EXPRESSION, ballerinaType);
        return new Value.ValueBuilder()
                .setMetadata(new MetaData("Label", "Description"))
                .setPlaceholder("{}")
                .value(value)
                .types(List.of(recordType, expressionType))
                .enabled(true).editable(true).optional(optional).setAdvanced(false)
                .build();
    }

    private static Listener listenerModel(Map<String, Value> extraProps) {
        Map<String, Value> properties = new LinkedHashMap<>();
        properties.put(PROP_KEY_VARIABLE_NAME, new Value.ValueBuilder()
                .setMetadata(new MetaData("Name", "The name of the listener")).value("").build());
        properties.put(PROP_KEY_LISTENER_TYPE, new Value.ValueBuilder()
                .setMetadata(new MetaData("Listener Type", "The type of the listener")).value("Listener").build());
        properties.putAll(extraProps);
        return new Listener.ListenerBuilder()
                .setId("1").setName("Listener").setType("Listener").setDisplayName("Listener")
                .setModuleName(MODULE).setOrgName("testorg").setVersion("0.1.0").setPackageName(MODULE)
                .setListenerProtocol(MODULE)
                .setProperties(properties)
                .build();
    }

    // ---- fixture-connector scenario (host, port = 9092, *ConsumerConfig config) ----

    private TriggerMetadataModel authoringModel() {
        TypeRef listenerType = new TypeRef("Listener", null);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.",
                listenerType, null, List.of("$service"), false, null, null, null);

        TriggerMetadataModel.ServiceType.Handlers handlers = new TriggerMetadataModel.ServiceType.Handlers(true,
                null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, true, false,
                List.of("$serviceConfig"), null, handlers, null);

        // Deliberately mirrors the real SMB shape that exposed the bug: the annotation's own declared
        // name ("ServiceConfig") differs from its backing record type's name ("ServiceConfigData").
        // `type.name` here references the ANNOTATION's own name (matching
        // TriggerLibraryFacts.Annotation#name(), i.e. AnnotationSymbol.getName()), not the record.
        TriggerMetadataModel.Annotation annotation = new TriggerMetadataModel.Annotation(
                "$serviceConfig", new TypeRef("ServiceConfig", null),
                TriggerMetadataModel.Annotation.ATTACH_POINT_SERVICE,
                TriggerMetadataModel.Annotation.PRESENCE_REQUIRED);

        return new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(annotation), null);
    }

    private TriggerLibraryFacts libraryFacts() {
        TriggerLibraryFacts.Param groupId = new TriggerLibraryFacts.Param(
                "groupId", "string", false, "RECORD_FIELD", "", List.of());
        TriggerLibraryFacts.Param pollingInterval = new TriggerLibraryFacts.Param(
                "pollingIntervalInMillis", "int", true, "RECORD_FIELD", "", List.of());
        TriggerLibraryFacts.Param config = new TriggerLibraryFacts.Param(
                "config", "triggerfixture:ConsumerConfig", true, "INCLUDED_RECORD", "",
                List.of(groupId, pollingInterval));
        TriggerLibraryFacts.Param host = new TriggerLibraryFacts.Param(
                "host", "string", false, "REQUIRED", "The listener host.", List.of());
        TriggerLibraryFacts.Param port = new TriggerLibraryFacts.Param(
                "port", "int", true, "DEFAULTABLE", "The listener port.", List.of());
        TriggerLibraryFacts.Listener listener = new TriggerLibraryFacts.Listener(
                "Listener", List.of(host, port, config));

        TriggerLibraryFacts.Param payload = new TriggerLibraryFacts.Param(
                "payload", "record {}", false, "REQUIRED", "", List.of());
        TriggerLibraryFacts.Function onMessage = new TriggerLibraryFacts.Function(
                "onMessage", List.of("remote"), "REMOTE", "error?", true, "Handles an inbound message.",
                List.of(payload));
        TriggerLibraryFacts.Param errorParam = new TriggerLibraryFacts.Param(
                "e", "error", false, "REQUIRED", "", List.of());
        TriggerLibraryFacts.Function onError = new TriggerLibraryFacts.Function(
                "onError", List.of("remote"), "REMOTE", "error?", true, "Handles a processing error.",
                List.of(errorParam));
        TriggerLibraryFacts.ServiceType serviceType = new TriggerLibraryFacts.ServiceType(
                "Service", "", List.of(onMessage, onError));

        // The annotation's own name is "ServiceConfig"; its backing record is "ServiceConfigData" with
        // one optional "topic" field -- the exact SMB-shaped mismatch this fixture targets.
        TriggerLibraryFacts.Param topic = new TriggerLibraryFacts.Param(
                "topic", "string", true, "RECORD_FIELD", "", List.of());
        TriggerLibraryFacts.Annotation annotation = new TriggerLibraryFacts.Annotation(
                "ServiceConfig", MODULE, "triggerfixture:ServiceConfigData", List.of("SERVICE"), "",
                List.of(topic));

        return new TriggerLibraryFacts(List.of(listener), List.of(serviceType), List.of(annotation));
    }

    private Listener fixtureListenerModel() {
        Map<String, Value> props = new LinkedHashMap<>();
        props.put("host", textValue("string"));
        props.put("port", numberValue("int", "int", true));
        props.put("groupId", textValue("string"));
        props.put("pollingIntervalInMillis", numberValue("int", "int", true));
        return listenerModel(props);
    }

    private TriggerUISchemaModel synthesize() {
        return TriggerModelSynthesizer.synthesize(authoringModel(), libraryFacts(), fixtureListenerModel(),
                "999", "Trigger Fixture", "https://example.test/icon.png", "event",
                "testorg", MODULE, MODULE, "0.1.0").orElseThrow();
    }

    /** Mirrors {@code TriggerModelReader}'s private JSON-level {@code initProperties -> properties} remap. */
    private ServiceInitModel toServiceInitModel(TriggerUISchemaModel model) {
        JsonObject root = GSON.toJsonTree(model).getAsJsonObject();
        JsonObject remapped = new JsonObject();
        for (String key : List.of("id", "displayName", "description", "orgName", "packageName", "moduleName",
                "version", "type", "icon")) {
            if (root.has(key)) {
                remapped.add(key, root.get(key));
            }
        }
        remapped.add("properties", root.get("initProperties"));
        return GSON.fromJson(remapped, ServiceInitModel.class);
    }

    @Test
    public void testSynthesizedModelShape() {
        TriggerUISchemaModel model = synthesize();
        Assert.assertEquals(model.moduleName(), MODULE);
        Assert.assertEquals(model.listenerKind(), "SINGLE_SELECT_LISTENER");

        Assert.assertTrue(model.initProperties().containsKey("listener"), "listener CHOICE should be present");
        TriggerUISchemaModel.Property listener = model.initProperties().get("listener");
        Assert.assertEquals(listener.codedata().type(), "LISTENER_CONFIG");
        Assert.assertEquals(listener.choices().size(), 2, "create-new + use-existing branches");

        Map<String, TriggerUISchemaModel.Property> createNewBranch = listener.choices().get(0).properties();
        Assert.assertTrue(createNewBranch.containsKey("listenerConfig"),
                "every listener init field lives inside one listenerConfig group");
        TriggerUISchemaModel.Property configGroup = createNewBranch.get("listenerConfig");
        Assert.assertEquals(configGroup.types().get(0).fieldType(), "GROUP_SECTION");
        Assert.assertFalse(configGroup.advanced());
        Map<String, TriggerUISchemaModel.Property> createNew = configGroup.properties();

        Assert.assertTrue(createNew.containsKey("listenerVarName"));
        Assert.assertFalse(createNew.get("listenerVarName").advanced(), "listener name is never advanced");
        Assert.assertTrue(createNew.containsKey("host"), "REQUIRED init param rendered directly");
        Assert.assertEquals(createNew.get("host").codedata().argType(), "LISTENER_PARAM_REQUIRED");
        Assert.assertEquals(createNew.get("host").codedata().position(), Integer.valueOf(1));
        Assert.assertEquals(createNew.get("port").codedata().argType(), "LISTENER_PARAM_REQUIRED");
        Assert.assertEquals(createNew.get("port").codedata().position(), Integer.valueOf(2));
        Assert.assertTrue(createNew.get("port").optional(), "DEFAULTABLE param is optional");
        Assert.assertFalse(createNew.get("port").advanced(), "optional listener params are still never advanced");
        Assert.assertEquals(createNew.get("port").types().get(0).fieldType(), "NUMBER", "int -> NUMBER widget");

        // The INCLUDED_RECORD `config` param is not itself rendered -- its fields are flattened, and
        // contribute no positional slot of their own (the NEXT top-level param, if any, would still
        // be position 2 -- there is none here, since config is the fixture's last init param).
        Assert.assertFalse(createNew.containsKey("config"));
        Assert.assertTrue(createNew.containsKey("groupId"));
        Assert.assertEquals(createNew.get("groupId").codedata().argType(), "LISTENER_PARAM_INCLUDED_FIELD");
        Assert.assertNull(createNew.get("groupId").codedata().position(),
                "included-record fields share no position");
        Assert.assertTrue(createNew.containsKey("pollingIntervalInMillis"));
        Assert.assertEquals(createNew.get("pollingIntervalInMillis").codedata().argType(),
                "LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD");

        Assert.assertEquals(model.serviceTypes().size(), 1);
        TriggerUISchemaModel.ServiceTypeModel serviceType = model.serviceTypes().get(0);
        Assert.assertEquals(serviceType.name(), "Service");
        Assert.assertEquals(serviceType.functions().size(), 2, "backedByConcreteType -> locked from introspection");
        Assert.assertTrue(serviceType.schemaFunctions().isEmpty());

        Assert.assertTrue(serviceType.properties().containsKey("serviceConfig"), "service annotation rendered");
        TriggerUISchemaModel.Property annotationProperty = serviceType.properties().get("serviceConfig");
        Assert.assertEquals(annotationProperty.codedata().type(), "ANNOTATION_ATTACHMENT");
        Assert.assertEquals(annotationProperty.codedata().originalName(), "ServiceConfig",
                "emission must use the annotation's own real name, not the schema's local id");
        Assert.assertFalse(annotationProperty.optional(), "declared required in the authoring schema");
        Assert.assertFalse(annotationProperty.advanced(), "a required annotation must never be hidden");
        Assert.assertNull(annotationProperty.value(),
                "no value is pre-filled -- the \"{}\" placeholder hints at the shape, the user fills it in");
        TriggerUISchemaModel.TypeMember member = annotationProperty.types().get(0).typeMembers().get(0);
        Assert.assertEquals(member.type(), "ServiceConfigData",
                "typeMembers names the backing RECORD type, distinct from the annotation's own name");
        Assert.assertEquals(member.packageName(), MODULE);
        Assert.assertTrue(member.selected(),
                "an annotation field's sole type member must be selected, matching the bundled models' "
                        + "hand-authored serviceConfig precedent (e.g. mssql/mysql/ftp/rabbitmq)");

        // Per direct product feedback ("I don't see [the service annotation] in the smb form"), a copy
        // of the same annotation must ALSO show up directly in the init form, right after the listener
        // choice -- not only inside serviceTypes[].properties() (which the view/update-service path
        // reads once a service already exists).
        Assert.assertTrue(model.initProperties().containsKey("serviceConfig"),
                "the service annotation must be visible at add-trigger time too, not just when editing "
                        + "an already-declared service");
        TriggerUISchemaModel.Property initAnnotation = model.initProperties().get("serviceConfig");
        Assert.assertEquals(initAnnotation.codedata().type(), "SERVICE_ANNOTATION",
                "the init-form copy uses the role SchemaDrivenSourceGenerator scans the filled form for");
        Assert.assertEquals(initAnnotation.codedata().originalName(), "ServiceConfig");
        Assert.assertNull(initAnnotation.value());
        Assert.assertFalse(initAnnotation.advanced());
        List<String> initKeysInOrder = new ArrayList<>(model.initProperties().keySet());
        Assert.assertTrue(initKeysInOrder.indexOf("serviceConfig") > initKeysInOrder.indexOf("listener"),
                "the annotation must appear after the listener choice, per direct product feedback");
    }

    @Test
    public void testEmitsRealListenerDeclarationAndServiceBlock() throws Exception {
        TriggerUISchemaModel model = synthesize();
        ServiceInitModel initModel = toServiceInitModel(model);

        Value listener = initModel.getProperties().get("listener");
        Value createNew = listener.getChoices().stream().filter(Value::isEnabled).findFirst().orElseThrow();
        createNew.getProperties().get("listenerConfig").getProperties().get("host").setValue("\"localhost\"");

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(initModel, model);
        Assert.assertTrue(block.contains("listener triggerfixture:Listener"), "listener decl emitted: " + block);
        Assert.assertTrue(block.contains("\"localhost\""), "host value should appear: " + block);
        Assert.assertTrue(block.contains("service triggerfixture:Service on "), "service descriptor: " + block);
        Assert.assertTrue(block.contains("remote function onMessage"), "onMessage handler emitted: " + block);
        Assert.assertTrue(block.contains("remote function onError"), "onError handler emitted: " + block);
        // The init-form's own SERVICE_ANNOTATION copy (see testSynthesizedModelShape) starts with no
        // value, so an unedited annotation must not be emitted above the service block.
        Assert.assertFalse(block.contains("@triggerfixture:ServiceConfig"),
                "an unfilled annotation must not be emitted from the init form: " + block);
    }


    @Test
    public void testCdcCrossModuleServiceTypeAndRealListenerType() {
        TypeRef.PackageInfo cdcPackage = new TypeRef.PackageInfo("ballerinax", "cdc", "cdc", "1.4.0");
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for CDC events.", new TypeRef("CdcListener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", cdcPackage), null, false, false,
                null, null, null, null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("CdcListener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1", "MySQL",
                null, "event", "ballerinax", "mysql", "mysql", "1.19.0").orElseThrow();

        TriggerUISchemaModel.Codedata serviceTypeCodedata = model.serviceTypes().get(0).codedata();
        Assert.assertEquals(serviceTypeCodedata.moduleName(), "cdc",
                "the service type's real module, not the connector's own (\"mysql\")");
        Assert.assertEquals(serviceTypeCodedata.orgName(), "ballerinax");
        Assert.assertEquals(serviceTypeCodedata.packageName(), "cdc");

        TriggerUISchemaModel.Property listenerVarName = model.initProperties().get("listener")
                .choices().stream().filter(TriggerUISchemaModel.Property::enabled).findFirst().orElseThrow()
                .properties().get("listenerConfig").properties().get("listenerVarName");
        Assert.assertEquals(listenerVarName.types().get(0).ballerinaType(), "mysql:CdcListener",
                "the listener's own declared type name, not a hardcoded \"Listener\"");

        ServiceInitModel initModel = toServiceInitModel(model);
        Value initListener = initModel.getProperties().get("listener");
        Value createNew = initListener.getChoices().stream().filter(Value::isEnabled).findFirst().orElseThrow();
        createNew.getProperties().get("listenerConfig").getProperties().get("listenerVarName").setValue("cdcListener");

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(initModel, model);
        Assert.assertTrue(block.contains("listener mysql:CdcListener"),
                "the declared listener type must be the real one, not the generic default: " + block);
        Assert.assertTrue(block.contains("service cdc:Service on "),
                "the service descriptor must reference the service type's real module: " + block);
        Assert.assertFalse(block.contains("mysql:Service"),
                "must not mistakenly qualify the service type with the connector's own module: " + block);
    }

    @Test
    public void testCrossModuleAnnotationResolvesRealRecordTypeFromCrossModuleFacts() {
        TypeRef.PackageInfo cdcPackage = new TypeRef.PackageInfo("ballerinax", "cdc", "cdc", "1.4.0");
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for CDC events.", new TypeRef("CdcListener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", cdcPackage), null, false, false,
                List.of("$serviceConfig"), null, null, null);
        TriggerMetadataModel.Annotation annotation = new TriggerMetadataModel.Annotation(
                "$serviceConfig", new TypeRef("ServiceConfig", cdcPackage),
                TriggerMetadataModel.Annotation.ATTACH_POINT_SERVICE,
                TriggerMetadataModel.Annotation.PRESENCE_REQUIRED);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(annotation), null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("CdcListener", List.of());
        // The connector's OWN introspected facts -- deliberately carries no "ServiceConfig" annotation,
        // since the real one lives in ballerinax/cdc, not ballerinax/mysql.
        TriggerLibraryFacts ownFacts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());

        TriggerLibraryFacts.Annotation cdcAnnotationFacts = new TriggerLibraryFacts.Annotation(
                "ServiceConfig", "cdc", "cdc:CdcServiceConfig", List.of("SERVICE"), "", List.of());
        TriggerLibraryFacts crossFacts = new TriggerLibraryFacts(List.of(), List.of(), List.of(cdcAnnotationFacts));
        Map<String, TriggerLibraryFacts> crossModuleFacts = Map.of("ballerinax/cdc", crossFacts);

        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, ownFacts, crossModuleFacts,
                listenerModel, "1", "MySQL", null, "event", "ballerinax", "mysql", "mysql", "1.19.0").orElseThrow();

        TriggerUISchemaModel.Property serviceConfig = model.initProperties().get("serviceConfig");
        TriggerUISchemaModel.TypeMember member = serviceConfig.types().get(0).typeMembers().get(0);
        Assert.assertEquals(member.type(), "CdcServiceConfig",
                "the real backing record type from the cross-module package, not the annotation's own name");
        Assert.assertEquals(serviceConfig.types().get(0).ballerinaType(), "cdc:CdcServiceConfig");
    }

    /** A driver-kind {@code requiredImport} (e.g. a CDC JDBC driver) must be imported as {@code as _}. */
    @Test
    public void testDriverRequiredImportEmitsSideEffectOnlyImport() {
        TypeRef.PackageInfo driverPackage = new TypeRef.PackageInfo(
                "ballerinax", "mssql.cdc.driver", "mssql.cdc.driver", "1.1.0");
        TriggerMetadataModel.RequiredImport requiredImport = new TriggerMetadataModel.RequiredImport(
                TriggerMetadataModel.RequiredImport.IMPORT_TYPE_DRIVER, driverPackage);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for CDC events.", new TypeRef("CdcListener", null), null,
                List.of("$service"), false, null, List.of(requiredImport), null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false,
                null, null, null, null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("CdcListener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1", "MSSQL",
                null, "event", "ballerinax", "mssql", "mssql", "1.19.0").orElseThrow();

        Assert.assertEquals(model.importStatements(), List.of("ballerinax/mssql.cdc.driver as _"),
                "a driver-kind requiredImport must be emitted as a side-effect-only (\"as _\") import");
    }

    @Test
    public void testExactlyOneRuleForcesPreferredAnnotationRequiredInInitForm() {
        IdentifierSpec identifier = new IdentifierSpec(
                IdentifierSpec.PRESENCE_OPTIONAL, List.of(IdentifierSpec.FORM_STRING_LITERAL));
        TriggerMetadataModel.Subject annotationFieldSubject = new TriggerMetadataModel.Subject(
                TriggerMetadataModel.Subject.KIND_ANNOTATION_FIELD, null, "$serviceConfig",
                List.of("queueName"), null, "fromAnnotation");
        TriggerMetadataModel.Subject identifierSubject = new TriggerMetadataModel.Subject(
                TriggerMetadataModel.Subject.KIND_IDENTIFIER, null, null, null, null, null);
        TriggerMetadataModel.Rule rule = new TriggerMetadataModel.Rule(
                "$queueNameSource", TriggerMetadataModel.Rule.RULE_EXACTLY_ONE,
                List.of(annotationFieldSubject, identifierSubject), null,
                "A consumer needs its queue name from exactly one source.", "fromAnnotation");

        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.", new TypeRef("Listener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false,
                List.of("$serviceConfig"), identifier, null, List.of(rule));
        TriggerMetadataModel.Annotation annotation = new TriggerMetadataModel.Annotation(
                "$serviceConfig", new TypeRef("ServiceConfig", null),
                TriggerMetadataModel.Annotation.ATTACH_POINT_SERVICE,
                TriggerMetadataModel.Annotation.PRESENCE_OPTIONAL);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(annotation), null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("Listener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1",
                "RabbitMQ", null, "event", "ballerinax", "rabbitmq", "rabbitmq", "3.6.0").orElseThrow();

        Assert.assertFalse(model.initProperties().containsKey("identifier"),
                "the identifier field is superseded by the preferred annotation field");
        TriggerUISchemaModel.Property serviceConfig = model.initProperties().get("serviceConfig");
        Assert.assertFalse(serviceConfig.optional(),
                "the only remaining source for the exactlyOne rule must be required, "
                        + "despite its own declared presence being \"optional\"");
    }

    @Test
    public void testDottedModuleNameAnnotationUsesNaturalPrefix() {
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.", new TypeRef("Listener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, true, false,
                List.of("$serviceConfig"), null, null, null);
        TriggerMetadataModel.Annotation annotation = new TriggerMetadataModel.Annotation(
                "$serviceConfig", new TypeRef("ServiceConfigType", null),
                TriggerMetadataModel.Annotation.ATTACH_POINT_SERVICE,
                TriggerMetadataModel.Annotation.PRESENCE_REQUIRED);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(annotation), null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("Listener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1",
                "AWS SQS", null, "event", "ballerinax", "aws.sqs", "aws.sqs", "5.0.0").orElseThrow();

        ServiceInitModel initModel = toServiceInitModel(model);
        initModel.getProperties().get("serviceConfig").setValue("{queueUrl: \"\"}");

        String block = SchemaDrivenSourceGenerator.buildServiceBlockForTrigger(initModel, model);
        Assert.assertTrue(block.contains("@sqs:ServiceConfigType"),
                "the annotation must use the module's natural import prefix: " + block);
        Assert.assertFalse(block.contains("@aws.sqs:ServiceConfigType"),
                "the raw dotted module name is never a valid qualifier: " + block);
        Assert.assertTrue(block.contains("awsSqsListener"),
                "the default listener variable name must stay a legal identifier, not contain a dot: " + block);
        Assert.assertFalse(block.contains("aws.sqsListener"), "a dot is never legal inside an identifier: " + block);
    }

    @Test
    public void testDataBindingParamComposition() {
        TypeRef listenerType = new TypeRef("Listener", null);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.",
                listenerType, null, List.of("$service"), false, null, null, null);

        // form: array + element: included encodes "includedRecord, cardinality array" in one shape --
        // the exact shape Kafka's real onConsumerRecord.records param declares.
        TriggerMetadataModel.ServiceType.Shape shape = new TriggerMetadataModel.ServiceType.Shape(
                TriggerMetadataModel.ServiceType.Shape.FORM_ARRAY,
                TriggerMetadataModel.ServiceType.Shape.ELEMENT_INCLUDED,
                new TypeRef("AnydataConsumerRecord", null), List.of("value"), null);
        TriggerMetadataModel.ServiceType.TypedescVariant variant = new TriggerMetadataModel.ServiceType.TypedescVariant(
                new TypeRef("anydata", null), null, List.of(shape));
        TriggerMetadataModel.ServiceType.DataBinding binding = new TriggerMetadataModel.ServiceType.DataBinding(
                List.of(variant));

        TriggerMetadataModel.ServiceType.Param recordsParam = new TriggerMetadataModel.ServiceType.Param(
                "$service.onConsumerRecord.records", "records", "The polled batch.", null, null, "required", null,
                binding, null);
        TriggerMetadataModel.ServiceType.ReturnSpec returns = new TriggerMetadataModel.ServiceType.ReturnSpec(
                "$service.onConsumerRecord.returns",
                List.of(new TypeRef("error", null), new TypeRef("()", null)), null, null);
        TriggerMetadataModel.ServiceType.HandlerOption option = new TriggerMetadataModel.ServiceType.HandlerOption(
                "$service.onConsumerRecord", "onConsumerRecord",
                TriggerMetadataModel.ServiceType.HandlerOption.KIND_REMOTE, null,
                "Invoked with each batch of records.", null, "required", null,
                List.of(recordsParam), returns, null, null, null);
        TriggerMetadataModel.ServiceType.Handlers handlers = new TriggerMetadataModel.ServiceType.Handlers(
                false, List.of(option));
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false, null, null, handlers,
                null);

        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("Listener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1", "Kafka",
                null, "event", "ballerinax", "kafka", "kafka", "4.5.0").orElseThrow();

        TriggerUISchemaModel.FunctionModel fn = model.serviceTypes().get(0).schemaFunctions().get(0);
        TriggerUISchemaModel.Parameter param = fn.parameters().get(0);
        Assert.assertEquals(param.kind(), "DATA_BINDING");
        TriggerUISchemaModel.Codedata cd = param.type().codedata();
        Assert.assertEquals(cd.type(), "PAYLOAD_TYPE_INCLUDED_RECORD");
        Assert.assertEquals(cd.defaultType(), "kafka:AnydataConsumerRecord",
                "a same-module included-record type is qualified too, same as any other handler param type");
        Assert.assertEquals(cd.template(), "{{type}}[]", "array cardinality -> [] template");
        Assert.assertEquals(cd.field(), "value");
    }

    /**
     * Per direct product feedback ("for the onCSVFile handler data binding part we need a similar UX
     * to what we have with the FTP csv method"): when a connector's own {@code DataBinding} declares a
     * {@code stream} shape alongside an {@code array} shape on the same variant (i.e. the bound value
     * may be read either as {@code T[]} or {@code stream<T, error?>}), the synthesizer must compose the
     * same {@code COMPLEX_PAYLOAD} + {@code stream} {@code PAYLOAD_MODIFIER} shape FTP's real
     * {@code onFileCsv} uses -- not a flat {@code PAYLOAD_TYPE} with no streaming toggle, and the
     * element fed into the stream modifier's template must stay unwrapped (else it double-wraps).
     */
    @Test
    public void testStreamableDataBindingComposesFtpLikeComplexPayload() {
        TypeRef listenerType = new TypeRef("Listener", null);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.",
                listenerType, null, List.of("$service"), false, null, null, null);

        TriggerMetadataModel.ServiceType.Shape arrayShape = new TriggerMetadataModel.ServiceType.Shape(
                TriggerMetadataModel.ServiceType.Shape.FORM_ARRAY,
                TriggerMetadataModel.ServiceType.Shape.ELEMENT_BARE, null, null, null);
        TriggerMetadataModel.ServiceType.Shape streamShape = new TriggerMetadataModel.ServiceType.Shape(
                TriggerMetadataModel.ServiceType.Shape.FORM_STREAM,
                TriggerMetadataModel.ServiceType.Shape.ELEMENT_BARE, null, null,
                List.of(new TypeRef("error", null), new TypeRef("()", null)));
        TriggerMetadataModel.ServiceType.TypedescVariant variant = new TriggerMetadataModel.ServiceType.TypedescVariant(
                new TypeRef("anydata", null), null, List.of(arrayShape, streamShape));
        TriggerMetadataModel.ServiceType.DataBinding binding = new TriggerMetadataModel.ServiceType.DataBinding(
                List.of(variant));

        TriggerMetadataModel.ServiceType.Param contentParam = new TriggerMetadataModel.ServiceType.Param(
                "$service.onFileCsv.content", "content", "The parsed rows.", null, null, "required", null,
                binding, null);
        TriggerMetadataModel.ServiceType.ReturnSpec returns = new TriggerMetadataModel.ServiceType.ReturnSpec(
                "$service.onFileCsv.returns",
                List.of(new TypeRef("error", null), new TypeRef("()", null)), null, null);
        TriggerMetadataModel.ServiceType.HandlerOption option = new TriggerMetadataModel.ServiceType.HandlerOption(
                "$service.onFileCsv", "onFileCsv", TriggerMetadataModel.ServiceType.HandlerOption.KIND_REMOTE, null,
                "Invoked for each .csv file.", null, "required", null,
                List.of(contentParam), returns, null, null, null);
        TriggerMetadataModel.ServiceType.Handlers handlers = new TriggerMetadataModel.ServiceType.Handlers(
                false, List.of(option));
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false, null, null, handlers,
                null);

        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);
        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("Listener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1", "Smb",
                null, "event", "ballerina", "smb", "smb", "1.0.2").orElseThrow();

        TriggerUISchemaModel.FunctionModel fn = model.serviceTypes().get(0).schemaFunctions().get(0);
        TriggerUISchemaModel.Parameter param = fn.parameters().get(0);
        TriggerUISchemaModel.Property type = param.type();
        Assert.assertEquals(type.types().get(0).fieldType(), "COMPLEX_PAYLOAD",
                "a streamable-capable binding composes like FTP's onFileCsv, not a flat PAYLOAD_TYPE");

        TriggerUISchemaModel.Property payload = type.properties().get("payload");
        Assert.assertEquals(payload.codedata().type(), "PAYLOAD_TYPE");
        Assert.assertEquals(payload.codedata().defaultType(), "anydata");
        Assert.assertEquals(payload.codedata().template(), "{{type}}[]");

        TriggerUISchemaModel.Property stream = type.properties().get("stream");
        Assert.assertEquals(stream.codedata().type(), "PAYLOAD_MODIFIER");
        Assert.assertEquals(stream.codedata().modifier(), "stream");
        Assert.assertEquals(stream.codedata().template(), "stream<{{type}}, error?>");
        Assert.assertEquals(stream.codedata().targetParam(), "content");
        Assert.assertEquals(stream.value(), Boolean.FALSE, "unchecked by default -- array stays the default form");

        Assert.assertEquals(PayloadComposer.effectiveType(type), "anydata[]",
                "default composition: base array template, stream modifier inactive");
        TriggerUISchemaModel.Property withStreamOn = new TriggerUISchemaModel.Property(type.metadata(), type.enabled(),
                type.editable(), type.optional(), type.advanced(), type.placeholder(), type.value(), type.types(),
                type.items(), type.choices(),
                Map.of("payload", payload, "stream", new TriggerUISchemaModel.Property(stream.metadata(),
                        stream.enabled(), stream.editable(), stream.optional(), stream.advanced(),
                        stream.placeholder(), true, stream.types(), stream.items(), stream.choices(),
                        stream.properties(), stream.codedata(), stream.validations())),
                type.codedata(), type.validations());
        Assert.assertEquals(PayloadComposer.effectiveType(withStreamOn), "stream<anydata, error?>",
                "toggling the stream flag on recomposes into the streaming wrap, superseding the array base -- "
                        + "the unwrapped element must feed the stream template, not the already-array-wrapped one");
    }

    /**
     * Regression test for the exact shape reported against SMB's real generated handlers:
     * {@code onFileXml(xml content, Caller caller, FileInfo fileInfo)} -- an optional, named,
     * non-data-bound parameter (a framework-injected object the handler may opt into) must render as
     * a {@code FLAG} checkbox with a fixed identifier (matching Kafka's real {@code caller}
     * convention), and its type -- same-module with no {@code packageInfo} per the {@link TypeRef}
     * convention -- must be qualified with the connector's own module prefix before emission (the
     * type string is embedded verbatim into generated source, which lives in a *different* file where
     * the connector is only an imported dependency).
     */
    @Test
    public void testOptionalNamedHandlerParamRendersAsFlagWithQualifiedType() {
        TypeRef listenerType = new TypeRef("Listener", null);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.",
                listenerType, null, List.of("$service"), false, null, null, null);

        TriggerMetadataModel.ServiceType.Param contentParam = new TriggerMetadataModel.ServiceType.Param(
                "$service.onFileXml.content", "content", "The file's content.", null,
                List.of(new TypeRef("xml", null)), "required", null, null, null);
        TriggerMetadataModel.ServiceType.Param callerParam = new TriggerMetadataModel.ServiceType.Param(
                "$service.onFileXml.caller", "caller", "The FTP connection.", null,
                List.of(new TypeRef("Caller", null)), "optional", null, null, null);
        TriggerMetadataModel.ServiceType.Param fileInfoParam = new TriggerMetadataModel.ServiceType.Param(
                "$service.onFileXml.fileInfo", "fileInfo", "The file's metadata.", null,
                List.of(new TypeRef("FileInfo", null)), "optional", null, null, null);
        TriggerMetadataModel.ServiceType.ReturnSpec returns = new TriggerMetadataModel.ServiceType.ReturnSpec(
                "$service.onFileXml.returns",
                List.of(new TypeRef("error", null), new TypeRef("()", null)), null, null);
        TriggerMetadataModel.ServiceType.HandlerOption option = new TriggerMetadataModel.ServiceType.HandlerOption(
                "$service.onFileXml", "onFileXml", TriggerMetadataModel.ServiceType.HandlerOption.KIND_REMOTE, null,
                "Invoked for each .xml file.", null, "required", null,
                List.of(contentParam, callerParam, fileInfoParam), returns, null, null, null);
        TriggerMetadataModel.ServiceType.Handlers handlers = new TriggerMetadataModel.ServiceType.Handlers(
                false, List.of(option));
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false, null, null, handlers,
                null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("Listener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1", "Smb",
                null, "event", "ballerina", "smb", "smb", "1.0.2").orElseThrow();

        TriggerUISchemaModel.FunctionModel fn = model.serviceTypes().get(0).schemaFunctions().get(0);
        Assert.assertEquals(fn.parameters().size(), 3);

        TriggerUISchemaModel.Parameter content = fn.parameters().get(0);
        Assert.assertEquals(content.kind(), "REQUIRED");
        Assert.assertEquals(content.type().value(), "xml", "a builtin type is never qualified");

        TriggerUISchemaModel.Parameter caller = fn.parameters().get(1);
        Assert.assertEquals(caller.kind(), "OPTIONAL");
        Assert.assertFalse(caller.enabled(), "an opt-in framework param is not included by default");
        Assert.assertTrue(caller.advanced(), "tucked behind Advanced by default, matching Kafka's caller");
        Assert.assertEquals(caller.type().types().get(0).fieldType(), "FLAG");
        Assert.assertEquals(caller.type().types().get(0).ballerinaType(), "smb:Caller",
                "a same-module type must be qualified with the connector's own prefix before emission");
        Assert.assertEquals(caller.type().value(), Boolean.FALSE);
        Assert.assertEquals(caller.name().value(), "caller");
        Assert.assertFalse(caller.name().editable(), "the identifier is fixed, not user-renamed");

        TriggerUISchemaModel.Parameter fileInfo = fn.parameters().get(2);
        Assert.assertEquals(fileInfo.type().types().get(0).fieldType(), "FLAG");
        Assert.assertEquals(fileInfo.type().types().get(0).ballerinaType(), "smb:FileInfo");
        Assert.assertEquals(fileInfo.name().value(), "fileInfo");
    }

    /**
     * Per direct product feedback ("similar to service annotation[s], function annotation[s] should
     * be available in the handler forms"): a handler declared in the authoring schema may reference its
     * own {@code attachPoint: "function"} annotations by id -- these must render into that handler's own
     * {@code properties} (the same whole-value {@code RECORD_MAP_EXPRESSION} convention as a
     * service-level annotation) and actually emit above the generated function.
     */
    @Test
    public void testHandlerLevelAnnotationRendersAndEmits() {
        TypeRef listenerType = new TypeRef("Listener", null);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.",
                listenerType, null, List.of("$service"), false, null, null, null);

        TriggerMetadataModel.ServiceType.Param contentParam = new TriggerMetadataModel.ServiceType.Param(
                "$service.onFileXml.content", "content", "The file's content.", null,
                List.of(new TypeRef("xml", null)), "required", null, null, null);
        TriggerMetadataModel.ServiceType.ReturnSpec returns = new TriggerMetadataModel.ServiceType.ReturnSpec(
                "$service.onFileXml.returns",
                List.of(new TypeRef("error", null), new TypeRef("()", null)), null, null);
        TriggerMetadataModel.ServiceType.HandlerOption option = new TriggerMetadataModel.ServiceType.HandlerOption(
                "$service.onFileXml", "onFileXml", TriggerMetadataModel.ServiceType.HandlerOption.KIND_REMOTE, null,
                "Invoked for each .xml file.", null, "required", List.of("$fnConfig"),
                List.of(contentParam), returns, null, null, null);
        TriggerMetadataModel.ServiceType.Handlers handlers = new TriggerMetadataModel.ServiceType.Handlers(
                false, List.of(option));
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, false, false, null, null, handlers,
                null);

        TriggerMetadataModel.Annotation fnAnnotation = new TriggerMetadataModel.Annotation(
                "$fnConfig", new TypeRef("FunctionConfig", null),
                TriggerMetadataModel.Annotation.ATTACH_POINT_FUNCTION,
                TriggerMetadataModel.Annotation.PRESENCE_OPTIONAL);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(fnAnnotation), null);

        TriggerLibraryFacts.Param mode = new TriggerLibraryFacts.Param(
                "mode", "string", true, "RECORD_FIELD", "", List.of());
        TriggerLibraryFacts.Annotation fnAnnotationFacts = new TriggerLibraryFacts.Annotation(
                "FunctionConfig", "smb", "smb:FunctionConfigData", List.of("FUNCTION"), "", List.of(mode));
        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("Listener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(
                List.of(listenerFacts), List.of(), List.of(fnAnnotationFacts));
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1", "Smb",
                null, "event", "ballerina", "smb", "smb", "1.0.2").orElseThrow();

        TriggerUISchemaModel.FunctionModel fn = model.serviceTypes().get(0).schemaFunctions().get(0);
        Assert.assertTrue(fn.properties().containsKey("fnConfig"),
                "handler-level annotation must render in the handler form, mirroring service annotations");
        TriggerUISchemaModel.Property annotation = fn.properties().get("fnConfig");
        Assert.assertEquals(annotation.codedata().type(), "ANNOTATION_ATTACHMENT");
        Assert.assertEquals(annotation.codedata().originalName(), "FunctionConfig");
        Assert.assertNull(annotation.value(), "no value is pre-filled -- the user must opt in to attach it");
        Assert.assertTrue(annotation.optional(), "declared optional in the authoring schema");
        Assert.assertTrue(annotation.types().get(0).typeMembers().get(0).selected(),
                "a handler annotation's sole type member must be selected, same as a service annotation");

        String source = SchemaDrivenSourceGenerator.buildFunctionSource(fn);
        Assert.assertFalse(source.contains("@smb:FunctionConfig"),
                "an unfilled annotation must not be emitted above the function: " + source);
    }

    /**
     * Regression test for the exact shape reported against a real trigger-metadata.json for
     * {@code ballerinax/trigger.google.calendar}: {@code init(ListenerConfig listenerConfig,
     * int|http:Listener listenOn = 8090)} -- a plain (non-{@code *}-spread) record-typed param
     * alongside a defaultable union param. Per direct product feedback, {@code listenerConfig}'s
     * widget is never rebuilt by the synthesizer -- it is looked up by name from the
     * {@code ListenerUtil}-shaped model (here hand-built to mirror that utility's real output: a
     * {@code RECORD_MAP_EXPRESSION} with one {@code typeMembers} entry, mirroring the existing
     * {@code getListenerFromSource} read-side view exactly), and only its codedata
     * (argType/position) is enriched.
     */
    @Test
    public void testRecordTypedListenerParamRendersAsSingleRecordField() {
        TypeRef listenerType = new TypeRef("Listener", null);
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.",
                listenerType, null, List.of("$calendarService"), false, null, null, null);
        TriggerMetadataModel.ServiceType.Handlers handlers = new TriggerMetadataModel.ServiceType.Handlers(true,
                null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$calendarService", "A calendar service.", new TypeRef("CalendarService", null), null, true, true,
                null, null, handlers, null);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), null, null);

        TriggerLibraryFacts.Param clientId = new TriggerLibraryFacts.Param(
                "clientId", "string", false, "RECORD_FIELD", "", List.of());
        TriggerLibraryFacts.Param calendarId = new TriggerLibraryFacts.Param(
                "calendarId", "string", true, "RECORD_FIELD", "", List.of());
        TriggerLibraryFacts.Param listenerConfig = new TriggerLibraryFacts.Param(
                "listenerConfig", "calendar:ListenerConfig", false, "REQUIRED", "", List.of(clientId, calendarId));
        TriggerLibraryFacts.Param listenOn = new TriggerLibraryFacts.Param(
                "listenOn", "int|http:Listener", true, "DEFAULTABLE", "", List.of());
        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener(
                "Listener", List.of(listenerConfig, listenOn));

        TriggerLibraryFacts.ServiceType serviceTypeFacts = new TriggerLibraryFacts.ServiceType(
                "CalendarService", "", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(
                List.of(listenerFacts), List.of(serviceTypeFacts), List.of());

        Map<String, Value> props = new LinkedHashMap<>();
        props.put("listenerConfig", recordValue("ListenerConfig", "calendar:ListenerConfig",
                "ballerinax:trigger.google.calendar:0.12.0", "trigger.google.calendar",
                "{clientId: \"\", calendarId: \"\"}", false));
        props.put("listenOn", numberValue("int", "int|http:Listener", true));
        Listener listenerModel = listenerModel(props);

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1",
                "Google Calendar", null, "event", "ballerinax", "trigger.google.calendar",
                "trigger.google.calendar", "0.12.0").orElseThrow();

        TriggerUISchemaModel.Property listenerProperty = model.initProperties().get("listener");
        Map<String, TriggerUISchemaModel.Property> createNew = listenerProperty.choices().get(0).properties()
                .get("listenerConfig").properties();

        Assert.assertTrue(createNew.containsKey("listenerVarName"));
        Assert.assertTrue(createNew.containsKey("listenOn"));
        // listenerConfig itself IS rendered -- as one record-literal editor, never flattened.
        Assert.assertTrue(createNew.containsKey("listenerConfig"));
        Assert.assertFalse(createNew.containsKey("clientId"), "record fields must not be flattened");
        Assert.assertFalse(createNew.containsKey("calendarId"), "record fields must not be flattened");

        TriggerUISchemaModel.Property configProperty = createNew.get("listenerConfig");
        Assert.assertEquals(configProperty.codedata().argType(), "LISTENER_PARAM_REQUIRED");
        Assert.assertEquals(configProperty.codedata().position(), Integer.valueOf(1));
        Assert.assertEquals(configProperty.types().size(), 2);
        Assert.assertEquals(configProperty.types().get(0).fieldType(), "RECORD_MAP_EXPRESSION");
        Assert.assertTrue(configProperty.types().get(0).selected());
        Assert.assertEquals(configProperty.types().get(0).ballerinaType(), "calendar:ListenerConfig");
        TriggerUISchemaModel.TypeMember member = configProperty.types().get(0).typeMembers().get(0);
        Assert.assertEquals(member.type(), "ListenerConfig", "the type member is the simple (unqualified) name");
        Assert.assertEquals(member.packageInfo(), "ballerinax:trigger.google.calendar:0.12.0");
        Assert.assertEquals(member.packageName(), "trigger.google.calendar");
        Assert.assertEquals(member.kind(), "RECORD_TYPE");
        Assert.assertFalse(member.selected(), "matches the real getListenerFromSource precedent");
        Assert.assertEquals(configProperty.types().get(1).fieldType(), "EXPRESSION");
        Assert.assertFalse(configProperty.types().get(1).selected());
        Assert.assertEquals(configProperty.types().get(1).ballerinaType(), "calendar:ListenerConfig");
        Assert.assertEquals(configProperty.value(), "{clientId: \"\", calendarId: \"\"}",
                "an empty-value skeleton pre-fills the record editor");
        Assert.assertFalse(configProperty.advanced());

        // listenOn is the next positional arg, with a NUMBER primary widget + EXPRESSION fallback.
        TriggerUISchemaModel.Property listenOnProperty = createNew.get("listenOn");
        Assert.assertEquals(listenOnProperty.codedata().position(), Integer.valueOf(2));
        Assert.assertEquals(listenOnProperty.types().size(), 2);
        Assert.assertEquals(listenOnProperty.types().get(0).fieldType(), "NUMBER");
        Assert.assertTrue(listenOnProperty.types().get(0).selected());
        Assert.assertEquals(listenOnProperty.types().get(0).ballerinaType(), "int");
        Assert.assertEquals(listenOnProperty.types().get(1).fieldType(), "EXPRESSION");
        Assert.assertFalse(listenOnProperty.types().get(1).selected());
        Assert.assertEquals(listenOnProperty.types().get(1).ballerinaType(), "int|http:Listener");

        // Nothing in the listener section is ever tucked behind "advanced", including optional fields.
        Assert.assertFalse(createNew.get("listenerVarName").advanced());
        Assert.assertFalse(listenOnProperty.advanced());
        Assert.assertTrue(listenOnProperty.optional(), "listenOn is still optional (defaultable), just not hidden");
    }

    /** A null {@code annotation.type()} (absent from a malformed metadata file) must not throw. */
    @Test
    public void testAnnotationWithNullTypeDoesNotThrow() {
        TriggerMetadataModel.Listener listener = new TriggerMetadataModel.Listener(
                "$listener", "Listens for events.", new TypeRef("Listener", null), null,
                List.of("$service"), false, null, null, null);
        TriggerMetadataModel.ServiceType serviceType = new TriggerMetadataModel.ServiceType(
                "$service", "A service.", new TypeRef("Service", null), null, true, false,
                List.of("$serviceConfig"), null, null, null);
        TriggerMetadataModel.Annotation annotation = new TriggerMetadataModel.Annotation(
                "$serviceConfig", null, TriggerMetadataModel.Annotation.ATTACH_POINT_SERVICE,
                TriggerMetadataModel.Annotation.PRESENCE_OPTIONAL);
        TriggerMetadataModel authoring = new TriggerMetadataModel(
                "v1.0", List.of(listener), List.of(serviceType), List.of(annotation), null);

        TriggerLibraryFacts.Listener listenerFacts = new TriggerLibraryFacts.Listener("Listener", List.of());
        TriggerLibraryFacts facts = new TriggerLibraryFacts(List.of(listenerFacts), List.of(), List.of());
        Listener listenerModel = listenerModel(Map.of());

        TriggerUISchemaModel model = TriggerModelSynthesizer.synthesize(authoring, facts, listenerModel, "1", "Test",
                null, "event", "testorg", "test", "test", "0.1.0").orElseThrow();

        Assert.assertEquals(model.initProperties().get("serviceConfig").codedata().originalName(), "serviceConfig",
                "falls back to the schema id when the annotation declares no type");
    }
}
