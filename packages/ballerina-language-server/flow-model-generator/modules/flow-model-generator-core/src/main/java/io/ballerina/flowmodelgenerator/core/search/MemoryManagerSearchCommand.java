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
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.LocalIndexCentral;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Handles the search command for memory managers.
 *
 * @since 1.2.0
 */
public class MemoryManagerSearchCommand extends SearchCommand {

    private static final Gson GSON = new Gson();
    private List<Item> cachedMemoryManagers;
    private final String orgName;

    public MemoryManagerSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
        orgName = queryMap.get("orgName");
    }

    @Override
    protected List<Item> defaultView() {
        List<Item> memoryManagers = getMemoryManagers();
        if (memoryManagers.isEmpty() || !(memoryManagers.getFirst() instanceof Category memoryManagerCategory)) {
            return memoryManagers;
        }

        List<Item> stores = memoryManagerCategory.items();
        String userAiVersion = AiUtils.getBallerinaAiModuleVersion(project);

        // If no AI version found, show all stores without filtering
        if (userAiVersion == null) {
            return List.of(memoryManagerCategory);
        }

        List<Item> compatibleStores = stores.stream()
                .filter(item -> item instanceof AvailableNode availableNode &&
                        isVersionCompatible(userAiVersion, getMinVersion(availableNode)))
                .toList();

        stores.clear();
        stores.addAll(compatibleStores);

        return List.of(memoryManagerCategory);
    }

    @Override
    protected List<Item> search() {
        List<Item> memoryManagers = getMemoryManagers();
        if (memoryManagers.isEmpty() || !(memoryManagers.getFirst() instanceof Category memoryManagerCategory)) {
            return memoryManagers;
        }

        List<Item> stores = memoryManagerCategory.items();
        String userAiVersion = AiUtils.getBallerinaAiModuleVersion(project);

        List<Item> matchingStores = stores.stream()
                .filter(item -> item instanceof AvailableNode availableNode &&
                        (orgName == null || availableNode.codedata().org().equalsIgnoreCase(orgName)) &&
                        WorkspaceModuleSearchUtils.matchesEveryWord(query, availableNode.metadata().label()) &&
                        (userAiVersion == null || isVersionCompatible(userAiVersion, getMinVersion(availableNode))))
                .toList();

        stores.clear();
        stores.addAll(matchingStores);

        return List.of(memoryManagerCategory);
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        return Collections.emptyMap();
    }

    @Override
    public JsonArray execute() {
        List<Item> items = (query.isEmpty() && orgName == null) ? defaultView() : search();
        return GSON.toJsonTree(items).getAsJsonArray();
    }

    private List<Item> getMemoryManagers() {
        if (cachedMemoryManagers == null) {
            cachedMemoryManagers = List.copyOf(LocalIndexCentral.getInstance().getMemoryManagers());
        }
        return cachedMemoryManagers;
    }

    private String getMinVersion(AvailableNode node) {
        if (node.metadata() == null || node.metadata().data() == null) {
            return null;
        }
        Object minVersion = node.metadata().data().get("minVersion");
        return minVersion != null ? minVersion.toString() : null;
    }

    private boolean isVersionCompatible(String userVersion, String requiredVersion) {
        // If the memory manager doesn't specify a required version, allow it
        if (requiredVersion == null) {
            return true;
        }
        // userVersion should not be null when calling this method (checked before filtering)
        if (userVersion == null) {
            return false;
        }
        return AiUtils.compareSemver(userVersion, requiredVersion) >= 0;
    }
}
