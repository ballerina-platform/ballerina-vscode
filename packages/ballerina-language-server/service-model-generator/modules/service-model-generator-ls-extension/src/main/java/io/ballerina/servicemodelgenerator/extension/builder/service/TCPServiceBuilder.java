package io.ballerina.servicemodelgenerator.extension.builder.service;

import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ServiceTypeFunction;
import io.ballerina.modelgenerator.commons.ServiceTypeFunction.ServiceTypeFunctionParameter;
import io.ballerina.modelgenerator.commons.service.TcpConnectionServiceResolver;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceClass;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil;
import io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TCP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;
import static io.ballerina.servicemodelgenerator.extension.util.ListenerUtil.getDefaultListenerDeclarationStmt;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.populateRequiredFunctionsForServiceType;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateRequiredFuncsDesignApproachAndServiceType;

/**
 * Builder class for TCP service.
 *
 * @since 1.2.0
 */
public final class TCPServiceBuilder extends AbstractServiceBuilder {

    private static final Logger LOGGER = Logger.getLogger(TCPServiceBuilder.class.getName());

    private static final String TCP_SERVICE_CLASS_NAME = "TcpEchoService";
    private static final String KIND_REMOTE = "REMOTE";
    private static final String REQUIRED_PARAMETER = "REQUIRED";
    private static final String TCP_ERROR_OPTIONAL = "tcp:Error?";

    // The handlers of a tcp:ConnectionService, all optional, with the signatures of tcpServiceClassTemplate.
    private static final List<ServiceTypeFunction> CONNECTION_HANDLERS = List.of(
            connectionHandler("onBytes", "Runs each time a client sends data", List.of(
                    parameter("caller", "The connection the data arrived on", "tcp:Caller"),
                    parameter("data", "The bytes received", "readonly & byte[]"))),
            connectionHandler("onError", "Runs when an error occurs on the connection", List.of(
                    parameter("tcpError", "The error that occurred", "tcp:Error"))),
            connectionHandler("onClose", "Runs when the client disconnects", List.of()));

    public static String tcpServiceClassTemplate(String serviceClassName) {
        String f = "    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error? {%n" +
                "        do {%n" +
                "            %s connectionService = new %s();%n" +
                "            return connectionService;%n" +
                "        } on fail error err {%n" +
                "            // handle error%n" +
                "            return error(\"unhandled error\", err);%n" +
                "        }%n" +
                "    }";
        return f.formatted(serviceClassName, serviceClassName);
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context) {
        ServiceInitModel serviceInitModel = context.serviceInitModel();
        ModulePartNode modulePartNode = context.document().syntaxTree().rootNode();
        ListenerDTO result = buildListenerDTO(context);
        String serviceName = Utils.generateTypeIdentifier(context.semanticModel(), context.document(),
                modulePartNode.lineRange().endLine(), TCP_SERVICE_CLASS_NAME);
        List<String> functionsStr = List.of(tcpServiceClassTemplate(serviceName));

        StringBuilder builder = new StringBuilder(NEW_LINE)
                .append(result.listenerDeclaration())
                .append(NEW_LINE)
                .append(SERVICE).append(SPACE).append(serviceInitModel.getBasePath(result.listenerProtocol()))
                .append(SPACE).append(ON).append(SPACE).append(result.listenerVarName()).append(SPACE)
                .append(OPEN_BRACE)
                .append(NEW_LINE)
                .append(String.join(TWO_NEW_LINES, functionsStr)).append(NEW_LINE)
                .append(CLOSE_BRACE).append(NEW_LINE);

        List<TextEdit> edits = new ArrayList<>();
        Utils.getServiceInitImportEdit(modulePartNode, serviceInitModel).ifPresent(edits::add);
        edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), builder.toString()));

        String serviceClass = ServiceClassUtil.getTcpConnectionServiceTemplate().formatted(serviceName);
        edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), serviceClass));
        return Map.of(context.filePath(), edits);
    }

    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        List<TextEdit> edits = new ArrayList<>();
        ListenerUtil.DefaultListener defaultListener = ListenerUtil.getDefaultListener(context);
        if (Objects.nonNull(defaultListener)) {
            String stmt = getDefaultListenerDeclarationStmt(defaultListener);
            edits.add(new TextEdit(Utils.toRange(defaultListener.linePosition()), stmt));
        }

        Service service = context.service();
        populateRequiredFuncsDesignApproachAndServiceType(service);
        populateRequiredFunctionsForServiceType(service);

        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        LineRange lineRange = rootNode.lineRange();
        String serviceName = Utils.generateTypeIdentifier(context.semanticModel(), context.document(),
                lineRange.endLine(), TCP_SERVICE_CLASS_NAME);

        StringBuilder serviceBuilder = new StringBuilder(NEW_LINE);
        buildServiceNodeStr(service, serviceBuilder);
        buildServiceNodeBody(List.of(tcpServiceClassTemplate(serviceName)), serviceBuilder);

        edits.add(new TextEdit(Utils.toRange(lineRange.endLine()), serviceBuilder.toString()));

        if (!importExists(rootNode, BALLERINA, TCP)) {
            String importStatement = Utils.getImportStmt(service.getOrgName(), service.getModuleName());
            edits.addFirst(new TextEdit(Utils.toRange(lineRange.startLine()), importStatement));
        }

        Set<String> propertyImportStmts = Utils.getMissingPropertyImportStmts(rootNode, service.getProperties(),
                Set.of(service.getOrgName() + "/" + service.getModuleName()));
        if (!propertyImportStmts.isEmpty()) {
            edits.addFirst(new TextEdit(Utils.toRange(lineRange.startLine()),
                    String.join(NEW_LINE, propertyImportStmts)));
        }

        String serviceClass = ServiceClassUtil.getTcpConnectionServiceTemplate().formatted(serviceName);
        edits.add(new TextEdit(Utils.toRange(lineRange.endLine()), serviceClass));

        return Map.of(context.filePath(), edits);
    }

    @Override
    public Service getModelFromSource(ModelFromSourceContext context) {
        Service service = super.getModelFromSource(context);
        if (Objects.nonNull(service) && Objects.nonNull(context.project())
                && context.node() instanceof ServiceDeclarationNode serviceNode) {
            // The connection handlers are an addition to the service model: failing to resolve them hides only
            // that section, never the service designer itself.
            try {
                TcpConnectionServiceResolver.findConnectionServiceClass(serviceNode, context.semanticModel())
                        .flatMap(classSymbol -> findClassDefinition(classSymbol, context))
                        .ifPresent(classDef -> service.setConnectionServiceClass(
                                withHandlerTemplates(ServiceClassUtil.getServiceClass(context.semanticModel(),
                                        classDef, ServiceClassUtil.ServiceClassContext.TYPE_DIAGRAM))));
            } catch (RuntimeException e) {
                LOGGER.log(Level.WARNING, "Failed to resolve the connection service class of the TCP service in "
                        + context.filePath(), e);
            }
        }
        return service;
    }

    /**
     * Adds a disabled template for each connection handler the class does not declare yet, so the service designer
     * can offer to add it. The templates match the handlers of the class generated with the service, and are added
     * through the generic add-function request with the class as the target. The handlers the class does declare
     * are marked optional, as tcp:ConnectionService has them, so they can be removed.
     */
    static ServiceClass withHandlerTemplates(ServiceClass serviceClass) {
        Set<String> handlerNames = CONNECTION_HANDLERS.stream()
                .map(ServiceTypeFunction::name)
                .collect(Collectors.toSet());
        serviceClass.functions().stream()
                .filter(function -> handlerNames.contains(function.getName().getValue()))
                .forEach(function -> function.setOptional(true));
        Set<String> declared = serviceClass.functions().stream()
                .map(function -> function.getName().getValue())
                .collect(Collectors.toSet());
        CONNECTION_HANDLERS.stream()
                .filter(handler -> !declared.contains(handler.name()))
                .map(ServiceModelUtils::getFunctionFromServiceTypeFunction)
                .forEach(serviceClass.functions()::add);
        return serviceClass;
    }

    private static ServiceTypeFunction connectionHandler(String name, String description,
                                                         List<ServiceTypeFunctionParameter> parameters) {
        return new ServiceTypeFunction(0, name, description, "", KIND_REMOTE, TCP_ERROR_OPTIONAL, 1, 0, "", 0, 1,
                parameters);
    }

    private static ServiceTypeFunctionParameter parameter(String name, String description, String type) {
        return new ServiceTypeFunctionParameter(0, name, name, description, REQUIRED_PARAMETER, type, "", "", 1, 0);
    }

    private static Optional<ClassDefinitionNode> findClassDefinition(ClassSymbol classSymbol,
                                                                     ModelFromSourceContext context) {
        return classSymbol.getLocation()
                .map(location -> CommonUtils.getDocument(context.project(), location))
                .flatMap(document -> TcpConnectionServiceResolver.findClassDefinition(classSymbol,
                        document.syntaxTree()));
    }

    @Override
    public String kind() {
        return TCP;
    }
}
