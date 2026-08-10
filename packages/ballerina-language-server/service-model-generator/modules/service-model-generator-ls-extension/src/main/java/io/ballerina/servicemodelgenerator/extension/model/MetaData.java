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

package io.ballerina.servicemodelgenerator.extension.model;

/**
 * @param label       the display name shown for this node/field in the designer
 * @param description the explanatory text shown alongside the label (e.g. as help text or a tooltip)
 * @param notice      an optional callout message (e.g. a deprecation or migration notice); absent
 *                    when there is nothing to flag
 * @param icon        an optional icon identifier for the front end to render next to the label
 * @param badge       a short category tag rendered as a chip before the function name in the service
 *                    designer (e.g. {@code "Event"}, {@code "Tool"}, {@code "GET"}, {@code "FUNC"},
 *                    {@code "INIT"}, or a trigger-specific value such as {@code "onCreate"}). Optional;
 *                    when absent the front end falls back to its default ({@code "Event"} for handlers).
 */
public record MetaData(String label, String description, String notice, String icon, String badge) {

    public MetaData(String label, String description) {
        this(label, description, null, null, null);
    }

    public MetaData(String label, String description, String notice) {
        this(label, description, notice, null, null);
    }

    public MetaData(String label, String description, String notice, String icon) {
        this(label, description, notice, icon, null);
    }
}
