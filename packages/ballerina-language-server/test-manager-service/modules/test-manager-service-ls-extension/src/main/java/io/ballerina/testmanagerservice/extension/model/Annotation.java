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

package io.ballerina.testmanagerservice.extension.model;

import io.ballerina.testmanagerservice.extension.Constants;

import java.util.ArrayList;
import java.util.List;

public record Annotation(Metadata metadata, Codedata codedata, String org, String module, String name,
                         List<Property> fields) {

    public static class ConfigAnnotationBuilder {

        private Metadata metadata;
        private Property groups;
        private Property enabled;
        private Property dataProvider;
        private Property dataProviderMode;
        private Property evalSetFile;
        private Property queries;
        private Property dependsOn;
        private Property after;
        private Property before;
        private Property runs;
        private Property minPassRate;

        public void metadata(Metadata metadata) {
            this.metadata = metadata;
        }

        public ConfigAnnotationBuilder groups(List<String> groupList) {
            groups = value("Groups", "Groups to run", groupList,
                    "EXPRESSION_SET", "groups");
            return this;
        }

        public void enabled(boolean enabled) {
            this.enabled = value("Enabled", "Enable/Disable the test", enabled,
                    "FLAG", "enabled");
        }

        public void dataProvider(String functionName) {
            dataProvider = value("Data Provider", "Data provider function", functionName,
                    "EXPRESSION", "dataProvider");
        }

        public void dataProviderMode(String mode) {
            dataProviderMode = value("Data Provider Mode", "Mode of data provider (function or evalSet)", mode,
                    "EXPRESSION", "dataProviderMode");
        }

        public void evalSetFile(String filePath) {
            evalSetFile = value("Evalset File", "Path to the evalSet data file", filePath,
                    "EXPRESSION", "evalSetFile");
        }

        public void queries(List<String> queryList) {
            queries = value("Queries", "Queries used as the test input", queryList,
                    "TEXT_SET", "queries");
        }

        public void dependsOn(List<String> functionList) {
            dependsOn = value("Depends On", "Functions this test depends on", functionList,
                    "EXPRESSION_SET", "dependsOn");
        }

        public void after(String functionName) {
            after = value("After", "Function to run after this test", functionName,
                    "EXPRESSION", "after");
        }

        public void before(String functionName) {
            before = value("Before", "Function to run before this test", functionName,
                    "EXPRESSION", "before");
        }

        public void runs(String runs) {
            this.runs = value("Runs", "Number of times to execute this test", runs,
                    "EXPRESSION", "runs");
        }

        public void minPassRate(String minPassRate) {
            this.minPassRate = value("Minimum Pass Rate (%)", "Minimum percentage of runs that must pass (0-100)",
                    minPassRate, "SLIDER", "minPassRate");
        }

        private static Property value(String label, String description, Object value, String valueType,
                                      String originalName) {
            Property.PropertyBuilder builder = new Property.PropertyBuilder();
            builder.metadata(new Metadata(label, description));
            builder.valueType(valueType);
            builder.originalName(originalName);
            builder.value(value);
            builder.advanced(false);
            builder.editable(true);
            builder.optional(true);
            return builder.build();
        }

        public Annotation build() {
            List<Property> properties = new ArrayList<>();

            if (groups == null) {
                groups = value("Groups", "Groups to run", List.of(),
                        "EXPRESSION_SET", "groups");
            }
            properties.add(groups);

            if (enabled == null) {
                enabled = value("Enabled", "Enable/Disable the test", true,
                        "FLAG", "enabled");
            }
            properties.add(enabled);

            // Always add dataProvider (default to empty string)
            if (dataProvider == null) {
                dataProvider = value("Data Provider", "Data provider function", "",
                        "EXPRESSION", "dataProvider");
            }
            properties.add(dataProvider);

            // Always add dataProviderMode (default to "function")
            if (dataProviderMode == null) {
                dataProviderMode = value("Data Provider Mode",
                        "Mode of data provider (function or evalSet)", "function",
                        "EXPRESSION", "dataProviderMode");
            }
            properties.add(dataProviderMode);

            // Always add evalSetFile (default to empty string)
            if (evalSetFile == null) {
                evalSetFile = value("Evalset File", "Path to the evalset data file", "",
                        "EXPRESSION", "evalSetFile");
            }
            properties.add(evalSetFile);

            // Always add queries (default to empty list)
            if (queries == null) {
                queries(List.of());
            }
            properties.add(queries);

            // Always add dependsOn (default to empty list)
            if (dependsOn == null) {
                dependsOn = value("Depends On", "Functions this test depends on", List.of(),
                        "EXPRESSION_SET", "dependsOn");
            }
            properties.add(dependsOn);

            // Always add after (default to empty string)
            if (after == null) {
                after = value("After", "Function to run after this test", "",
                        "EXPRESSION", "after");
            }
            properties.add(after);

            // Always add before (default to empty string)
            if (before == null) {
                before = value("Before", "Function to run before this test", "",
                        "EXPRESSION", "before");
            }
            properties.add(before);

            // Always add runs (default to "1")
            if (runs == null) {
                runs = value("Runs", "Number of times to execute this test", "1",
                        "EXPRESSION", "runs");
            }
            properties.add(runs);

            // Always add minPassRate (default to "1")
            if (minPassRate == null) {
                minPassRate = value("Minimum Pass Rate (%)",
                        "Minimum percentage of runs that must pass (0-100)",
                        "1", "SLIDER", "minPassRate");
            }
            properties.add(minPassRate);

            String org = Constants.ORG_BALLERINA;
            String module = Constants.MODULE_TEST;
            String name = "Config";
            return new Annotation(metadata, null, org, module, name, properties);
        }
    }
}
