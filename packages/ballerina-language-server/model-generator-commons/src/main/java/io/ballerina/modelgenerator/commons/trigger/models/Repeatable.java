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

package io.ballerina.modelgenerator.commons.trigger.models;

/**
 * How a schema-driven trigger handler may be added to a service. Deserialized by name from a trigger
 * UI schema's {@code repeatable} field; an absent value means {@link #FALSE}.
 *
 * <ul>
 *   <li>{@link #ONE_OF_GROUP} — adding one member removes every sibling in its {@code group}.</li>
 *   <li>{@link #ONE_EACH_PER_GROUP} — each group member addable once, independently of siblings.</li>
 *   <li>{@link #LEGACY} — hidden by default; once present in source, displaces every non-{@code
 *       LEGACY} function (legacy and "modern" catalogs are mutually incompatible).</li>
 * </ul>
 *
 * @since 1.9.0
 */
public enum Repeatable {

    FALSE,
    TRUE,
    ONE_OF_GROUP,
    ONE_EACH_PER_GROUP,
    LEGACY;

    public static Repeatable orDefault(Repeatable value) {
        return value == null ? FALSE : value;
    }

    /** A group-scoped value on an ungrouped handler is meaningless and collapses to {@link #FALSE}. */
    public Repeatable effective(String group) {
        if ((this == ONE_OF_GROUP || this == ONE_EACH_PER_GROUP) && (group == null || group.isBlank())) {
            return FALSE;
        }
        return this;
    }

    public boolean staysAddable() {
        return this == TRUE;
    }

    public boolean isGroupExclusive() {
        return this == ONE_OF_GROUP;
    }

    public boolean isLegacy() {
        return this == LEGACY;
    }
}
