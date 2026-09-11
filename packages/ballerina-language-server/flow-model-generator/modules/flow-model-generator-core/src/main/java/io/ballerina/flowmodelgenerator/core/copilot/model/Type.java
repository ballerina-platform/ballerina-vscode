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

package io.ballerina.flowmodelgenerator.core.copilot.model;

import java.util.List;

/**
 * Represents a type reference with optional links.
 *
 * @since 1.7.0
 */
public class Type {
    private String name;
    private List<TypeLink> links;
    /**
     * The spec §1.4 — this reference stands for the named type <i>and every subtype of it</i>, not the
     * exact type alone.
     *
     * <p>Set only where the metadata document sets it, which the spec confines to the three positions that
     * describe a <i>relationship</i> a declared type must satisfy rather than a type to declare verbatim: a
     * data binding's {@code constraint} and {@code excludes}, and a shape's {@code envelope}. It reaches
     * the wire because the two readings produce different prose — "include {@code *http:StatusCodeResponse;}"
     * names one record, whereas the family means any of {@code http:Ok}, {@code http:Created} or the
     * reader's own narrowing — and nothing else on the page can express the difference.
     *
     * <p>Boxed, and set only when true: the spec writes the flag as {@code const: true} and omits it
     * everywhere else, so a {@code false} would state something the document never said.
     */
    private Boolean subtypeFamily;

    public Type() {
    }

    public Type(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<TypeLink> getLinks() {
        return links;
    }

    public void setLinks(List<TypeLink> links) {
        this.links = links;
    }

    public Boolean getSubtypeFamily() {
        return subtypeFamily;
    }

    /** Marks this reference as standing for a whole subtype family; a no-op for {@code false}. */
    public void setSubtypeFamily(boolean subtypeFamily) {
        this.subtypeFamily = subtypeFamily ? Boolean.TRUE : null;
    }
}
