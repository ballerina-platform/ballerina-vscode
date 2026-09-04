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

package io.ballerina.modelgenerator.commons;

import java.util.Objects;

/**
 * Identifies a module the way the search index does: an organization together with the module name stored in the
 * {@code Package.name} column ({@code packageName[.moduleNamePart]}).
 *
 * <p>The organization is part of the identity because {@code Package.name} has no uniqueness constraint - two
 * organizations can publish a same-named package (the shipped index contains {@code ballerina/np} vs
 * {@code ballerinax/np} and {@code xlibb/solace} vs {@code ballerinax/solace}). Keying anything by module name alone
 * silently collapses such a pair, which can both merge one organization's rows into another's and misreport an
 * unindexed module as indexed - suppressing the live-compilation fallback that would otherwise surface it.</p>
 *
 * @param org        the organization that resolved the module
 * @param moduleName the module name as stored in the index's {@code Package.name} column
 * @since 1.8.0
 */
public record ModuleCoordinate(String org, String moduleName) implements Comparable<ModuleCoordinate> {

    public ModuleCoordinate {
        Objects.requireNonNull(org, "org cannot be null");
        Objects.requireNonNull(moduleName, "moduleName cannot be null");
    }

    /**
     * Orders by module name first so results grouped by module stay contiguous, then by organization to keep
     * same-named modules from different organizations in a stable, reproducible order.
     */
    @Override
    public int compareTo(ModuleCoordinate other) {
        int nameComparison = moduleName.compareTo(other.moduleName);
        return nameComparison != 0 ? nameComparison : org.compareTo(other.org);
    }

    @Override
    public String toString() {
        return org + "/" + moduleName;
    }
}
