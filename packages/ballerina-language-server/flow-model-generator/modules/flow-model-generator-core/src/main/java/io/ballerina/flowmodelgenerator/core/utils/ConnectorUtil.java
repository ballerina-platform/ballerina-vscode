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

package io.ballerina.flowmodelgenerator.core.utils;

import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.core.LocalIndexCentral;

import java.lang.reflect.Type;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Utility class for connector-related operations.
 *
 * @since 1.5.0
 */
public class ConnectorUtil {

    // TODO: Remove this once the name is retrieved from the library module
    private static final String CONNECTOR_NAME_CORRECTION_JSON = "connector_name_correction.json";
    private static final Type CONNECTOR_NAME_MAP_TYPE = new TypeToken<Map<String, String>>() { }.getType();
    private static final Map<String, String> CONNECTOR_NAME_MAP =
            LocalIndexCentral.getInstance().readJsonResource(CONNECTOR_NAME_CORRECTION_JSON, CONNECTOR_NAME_MAP_TYPE);
    public static final String CLIENT = "Client";

    private static final String CONNECTORS_LANDING_JSON = "connectors_landing.json";
    private static final Type CONNECTION_CATEGORY_LIST_TYPE = new TypeToken<Map<String, List<String>>>() { }.getType();
    private static final String DEFAULT_CONNECTION_TYPE = "Default";
    private static final Map<String, String> MODULE_TO_CATEGORY_MAP;

    static {
        Map<String, List<String>> categories = LocalIndexCentral.getInstance()
                .readJsonResource(CONNECTORS_LANDING_JSON, CONNECTION_CATEGORY_LIST_TYPE);
        Map<String, String> moduleToCategory = new HashMap<>();
        for (Map.Entry<String, List<String>> entry : categories.entrySet()) {
            for (String moduleEntry : entry.getValue()) {
                String moduleName = moduleEntry.contains(":") ? moduleEntry.split(":")[0] : moduleEntry;
                moduleToCategory.put(moduleName, entry.getKey());
            }
        }
        MODULE_TO_CATEGORY_MAP = moduleToCategory;
    }

    /**
     * Get the formatted connector name based on the connector name and package name.
     *
     * @param connectorName the name of the connector
     * @param rawPackageName the raw package name
     * @return the formatted connector name
     */
    public static String getConnectorName(String connectorName, String rawPackageName) {
        if (rawPackageName.equals(".")) {
            return connectorName;
        }
        // A module with several client classes needs the class to be part of the key.
        String exactName = CONNECTOR_NAME_MAP.get(rawPackageName + ":" + connectorName);
        if (exactName != null) {
            return exactName;
        }
        String packageName = CONNECTOR_NAME_MAP.getOrDefault(rawPackageName, getLastPackagePrefix(rawPackageName));
        if (connectorName.equals(CLIENT)) {
            return packageName;
        }

        // TODO: Remove the replacement once a proper solution comes from the index
        return packageName + " " + (connectorName.endsWith("Client") ?
                connectorName.substring(0, connectorName.length() - 6) : connectorName);
    }

    /**
     * Get the connection category for a given module name using the connector landing data.
     * Returns "Default" if the module name is not found in any category.
     *
     * @param moduleName the module name (e.g., "http", "mysql", "kafka")
     * @return the category name (e.g., "Network", "Database") or "default" if not found
     */
    public static String getConnectionCategory(String moduleName) {
        return MODULE_TO_CATEGORY_MAP.getOrDefault(moduleName, DEFAULT_CONNECTION_TYPE);
    }

    /**
     * Get the last package prefix with proper capitalization.
     *
     * @param rawPackageName the raw package name
     * @return the formatted package prefix
     */
    private static String getLastPackagePrefix(String rawPackageName) {
        String trimmedPackageName = rawPackageName.contains(".")
                ? rawPackageName.substring(rawPackageName.lastIndexOf('.') + 1) : rawPackageName;
        return trimmedPackageName.substring(0, 1).toUpperCase(Locale.ROOT) + trimmedPackageName.substring(1);
    }
}
