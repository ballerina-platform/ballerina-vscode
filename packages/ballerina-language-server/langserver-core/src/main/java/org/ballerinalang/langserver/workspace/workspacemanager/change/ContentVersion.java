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

package org.ballerinalang.langserver.workspace.workspacemanager.change;

import javax.annotation.Nonnull;

/**
 * Monotonically increasing content stamp for document updates.
 *
 * @since 1.7.0
 */
public final class ContentVersion implements Comparable<ContentVersion> {

    private final int value;

    /**
     * Creates a content version.
     *
     * @param value non-negative version value
     */
    public ContentVersion(int value) {
        if (value < 0) {
            throw new IllegalArgumentException("value must be non-negative");
        }
        this.value = value;
    }

    /**
     * Returns the numeric version value.
     *
     * @return version value
     */
    public int value() {
        return value;
    }

    /**
     * Returns the next version.
     *
     * @return incremented version
     */
    public ContentVersion next() {
        if (value == Integer.MAX_VALUE) {
            throw new IllegalStateException("content version overflow");
        }
        return new ContentVersion(value + 1);
    }

    /**
     * Compares this version with another version.
     *
     * @param other version to compare with
     * @return a negative integer, zero, or a positive integer
     */
    @Override
    public int compareTo(@Nonnull ContentVersion other) {
        return Integer.compare(this.value, other.value);
    }

    /**
     * Returns whether this version equals another object.
     *
     * @param obj object to compare
     * @return {@code true} when both values are equal
     */
    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (!(obj instanceof ContentVersion other)) {
            return false;
        }
        return value == other.value;
    }

    /**
     * Returns the hash code for this version.
     *
     * @return hash code value
     */
    @Override
    public int hashCode() {
        return Integer.hashCode(value);
    }

    /**
     * Returns a string representation of the version.
     *
     * @return version string
     */
    @Override
    public String toString() {
        return "ContentVersion[" + value + "]";
    }
}
