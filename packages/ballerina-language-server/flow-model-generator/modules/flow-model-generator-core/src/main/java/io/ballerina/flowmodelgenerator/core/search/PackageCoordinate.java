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

package io.ballerina.flowmodelgenerator.core.search;

import java.util.Objects;

/**
 * Identifies a published package: an organization together with the package name.
 *
 * <p>Distinct from {@link io.ballerina.modelgenerator.commons.ModuleCoordinate}, which names a <i>module</i>. The two
 * cannot be derived from one another: a package name may itself contain dots ({@code edifact.d03a.supplychain},
 * {@code data.jsondata}), so the package a qualified module name belongs to cannot be recovered by splitting the
 * module name - it has to come from the resolved descriptor. Keeping the two types apart is what stops that mistake
 * being made silently.</p>
 *
 * <p>The organization is part of the identity because package names are not unique across organizations.</p>
 *
 * @param org         the organization that published the package
 * @param packageName the package name
 * @since 1.8.0
 */
record PackageCoordinate(String org, String packageName) implements Comparable<PackageCoordinate> {

    PackageCoordinate {
        Objects.requireNonNull(org, "org cannot be null");
        Objects.requireNonNull(packageName, "packageName cannot be null");
    }

    @Override
    public int compareTo(PackageCoordinate other) {
        int nameComparison = packageName.compareTo(other.packageName);
        return nameComparison != 0 ? nameComparison : org.compareTo(other.org);
    }

    @Override
    public String toString() {
        return org + "/" + packageName;
    }
}
