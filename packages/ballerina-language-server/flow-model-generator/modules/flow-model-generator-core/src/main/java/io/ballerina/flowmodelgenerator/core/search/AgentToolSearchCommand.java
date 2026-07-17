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

package io.ballerina.flowmodelgenerator.core.search;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.PositionUtil;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Handles the search command for agent tools.
 *
 * @since 1.2.0
 */
public class AgentToolSearchCommand extends SearchCommand {

    private static final Gson GSON = new Gson();
    private List<Item> cachedAgentTools;

    public AgentToolSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
    }

    @Override
    protected List<Item> defaultView() {
        return getAgentTools();
    }

    @Override
    protected List<Item> search() {
        List<Item> agentTools = getAgentTools();
        if (agentTools.isEmpty()) {
            return agentTools;
        }

        Category agentToolCategory = (Category) agentTools.getFirst();
        List<Item> tools = agentToolCategory.items();
        String lowerCaseQuery = query == null ? null : query.toLowerCase(Locale.ROOT);
        List<Item> matchingTools = tools.stream()
                .filter(item -> item instanceof AvailableNode availableNode &&
                        (lowerCaseQuery == null ||
                                availableNode.metadata().label().toLowerCase(Locale.ROOT).contains(lowerCaseQuery) ||
                                availableNode.codedata().symbol().toLowerCase(Locale.ROOT).contains(lowerCaseQuery) ||
                                availableNode.metadata().description().toLowerCase(Locale.ROOT)
                                        .contains(lowerCaseQuery)))
                .toList();

        tools.clear();
        tools.addAll(matchingTools);

        return List.of(agentToolCategory);
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        return Collections.emptyMap();
    }

    @Override
    public JsonArray execute() {
        List<Item> items = query.isEmpty() ? defaultView() : search();
        return GSON.toJsonTree(items).getAsJsonArray();
    }

    private List<Item> getAgentTools() {
        if (cachedAgentTools == null) {
            cachedAgentTools = buildAgentToolNodes();
        }
        return cachedAgentTools;
    }

    private List<Item> buildAgentToolNodes() {
        Package currentPackage = project.currentPackage();
        List<Symbol> functionSymbols = PackageUtil.getCompilation(currentPackage)
                .getSemanticModel(currentPackage.getDefaultModule().moduleId())
                .moduleSymbols().stream()
                .filter(symbol -> symbol.kind().equals(SymbolKind.FUNCTION))
                .toList();

        Category.Builder agentToolsBuilder = rootBuilder.stepIn(Category.Name.AGENT_TOOLS);
        List<Item> agentToolNodes = new ArrayList<>();
        String lowerCaseQuery = query.isEmpty() ? null : query.toLowerCase(Locale.ROOT);

        for (Symbol symbol : functionSymbols) {
            FunctionSymbol functionSymbol = (FunctionSymbol) symbol;

            // Check if function is an agent tool
            if (!isAgentTool(functionSymbol)) {
                continue;
            }

            // Skip if function is within current position (editing context)
            Optional<Location> location = symbol.getLocation();
            if (position != null && location.isPresent()) {
                LineRange fnLineRange = location.get().lineRange();
                if (fnLineRange.fileName().equals(position.fileName()) &&
                        PositionUtil.isWithinLineRange(fnLineRange, position)) {
                    continue;
                }
            }

            // Filter by query if provided
            if (symbol.getName().isEmpty() ||
                    (lowerCaseQuery != null && !symbol.getName().get().toLowerCase(Locale.ROOT)
                            .contains(lowerCaseQuery))) {
                continue;
            }

            boolean isIsolatedFunction = functionSymbol.qualifiers().contains(Qualifier.ISOLATED);

            // Extract input parameters
            List<Map<String, String>> inputParameters = new ArrayList<>();
            FunctionTypeSymbol functionTypeSymbol = functionSymbol.typeDescriptor();
            Optional<List<ParameterSymbol>> optParams = functionTypeSymbol.params();
            if (optParams.isPresent()) {
                for (ParameterSymbol parameterSymbol : optParams.get()) {
                    String paramName = parameterSymbol.getName().orElse("");
                    String paramType = parameterSymbol.typeDescriptor().signature();
                    inputParameters.add(Map.of("name", paramName, "type", paramType));
                }
            }

            // Extract output type
            String outputType = "";
            Optional<TypeSymbol> optReturnTypeSymbol = functionTypeSymbol.returnTypeDescriptor();
            if (optReturnTypeSymbol.isPresent()) {
                outputType = optReturnTypeSymbol.get().signature();
            }

            Metadata metadata = new Metadata.Builder<>(null)
                    .label(symbol.getName().get())
                    .description(functionSymbol.documentation()
                            .flatMap(Documentation::description)
                            .orElse("Agent tool function"))
                    .addData("isAgentTool", true)
                    .addData("isIsolatedFunction", isIsolatedFunction)
                    .addData("inputParameters", inputParameters)
                    .addData("outputType", outputType)
                    .build();

            Codedata.Builder<Object> codedataBuilder = new Codedata.Builder<>(null)
                    .node(NodeKind.FUNCTION_CALL)
                    .symbol(symbol.getName().get());

            Optional<ModuleSymbol> moduleSymbol = functionSymbol.getModule();
            if (moduleSymbol.isPresent()) {
                ModuleID id = moduleSymbol.get().id();
                codedataBuilder
                        .org(id.orgName())
                        .module(id.packageName())
                        .version(id.version());
            }

            agentToolNodes.add(new AvailableNode(metadata, codedataBuilder.build(), true));
        }

        agentToolsBuilder.items(agentToolNodes);
        return rootBuilder.build().items();
    }

    private boolean isAgentTool(FunctionSymbol functionSymbol) {
        // Check if function is isolated
        if (!functionSymbol.qualifiers().contains(Qualifier.ISOLATED)) {
            return false;
        }
        // Check if function has the @ai:AgentTool annotation and a valid tool signature
        return CommonUtils.isAgentToolFunction(functionSymbol) && isValidAgentToolSignature(functionSymbol);
    }

    private boolean isValidAgentToolSignature(FunctionSymbol functionSymbol) {
        FunctionTypeSymbol functionTypeSymbol = functionSymbol.typeDescriptor();
        TypeSymbol anydata = PackageUtil.getCompilation(project.currentPackage())
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId())
                .types().ANYDATA;

        // Check parameters are subtypes of anydata
        Optional<List<ParameterSymbol>> optParams = functionTypeSymbol.params();
        if (optParams.isPresent()) {
            for (ParameterSymbol parameterSymbol : optParams.get()) {
                if (!CommonUtils.subTypeOf(parameterSymbol.typeDescriptor(), anydata)) {
                    return false;
                }
            }
        }

        // Check return type is subtype of anydata
        Optional<TypeSymbol> optReturnTypeSymbol = functionTypeSymbol.returnTypeDescriptor();
        if (optReturnTypeSymbol.isPresent()) {
            if (!CommonUtils.subTypeOf(optReturnTypeSymbol.get(), anydata)) {
                return false;
            }
        }

        return true;
    }
}
