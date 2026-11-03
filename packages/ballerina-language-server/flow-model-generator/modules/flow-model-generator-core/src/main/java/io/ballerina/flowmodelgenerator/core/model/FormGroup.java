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

package io.ballerina.flowmodelgenerator.core.model;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A titled section of a node form that a set of properties renders in together.
 *
 * <p>Carried on each member property as {@code metadata.data.group}, so it survives every path that
 * rebuilds a form from its properties alone (the template and the source re-read) and travels back
 * with the node the form sends. The form renders the members in one collapsible card, in property
 * order, under the description.
 *
 * @param id           stable identifier
 * @param label        the section title
 * @param description  shown under the title: what the section is for, or what filling it in takes; may be
 *                     {@code null}
 * @param collapsed    whether the section opens collapsed
 * @param requireAnyOf member keys of which at least one must be filled before the form saves, though each is
 *                     optional on its own; empty when the section asks for nothing. The form marks such a
 *                     section as required
 * @since 1.10.0
 */
public record FormGroup(String id, String label, String description, boolean collapsed, List<String> requireAnyOf) {

    /** Key under a property's {@code metadata.data} that names its group. */
    public static final String DATA_KEY = "group";

    public FormGroup {
        requireAnyOf = requireAnyOf == null ? List.of() : List.copyOf(requireAnyOf);
    }

    /**
     * Places the named properties, those present, in this group. A property already in another group
     * is moved.
     *
     * @param properties the live property map, updated in place
     * @param keys       the member property keys
     */
    public void assign(Map<String, Property> properties, String... keys) {
        for (String key : keys) {
            Property existing = properties.get(key);
            if (existing == null) {
                continue;
            }
            Map<String, Object> data = existing.metadata() == null || existing.metadata().data() == null
                    ? new LinkedHashMap<>() : new LinkedHashMap<>(existing.metadata().data());
            data.put(DATA_KEY, this);
            Property.Builder<Object> builder = Property.Builder.copyFrom(existing);
            // A grouped field renders in its section, never among the advanced options.
            builder.advanced(false).metadata().data(data);
            properties.put(key, builder.build());
        }
    }
}
