/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.util.List;
import java.util.Map;


/**
 * Represents a member of a type construct.
 *
 * @param kind                  Kind of the member.
 * @param refs                  References to the type descriptor.
 * @param type                  Display name for the type.
 * @param typeName              Type name of the member.
 * @param name                  Name of the member.
 * @param defaultValue          Default value of the member.
 * @param optional              Whether the member is optional.
 * @param readonly              Whether the member is readonly.
 * @param isGraphqlId           Whether the member is a graphql ID
 * @param docs                  Documentation of the member
 * @param annotationAttachments Annotations of the member.
 * @param imports               Imports of the member.
 * @param selected              Member is selected or not.
 * @param graphqlType           GraphQL type of the member in SDL notation, set only for the GraphQL type model.
 * @since 1.0.0
 */
public record Member(
        MemberKind kind,
        List<String> refs,
        Object type,
        String typeName,
        String name,
        String defaultValue,
        boolean optional,
        boolean readonly,
        boolean isGraphqlId,
        String docs,
        List<AnnotationAttachment> annotationAttachments,
        Map<String, String> imports,
        boolean selected,
        String graphqlType
) {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    /**
     * Creates a pre-populated {@link MemberBuilder} from this instance, allowing selective modification
     * of individual fields while preserving all other values.
     *
     * @return a new builder initialized with all fields of this {@link Member}
     */
    public MemberBuilder toBuilder() {
        return (MemberBuilder) new MemberBuilder()
                .kind(kind)
                .refs(refs)
                .type(type)
                .typeName(typeName)
                .name(name)
                .defaultValue(defaultValue)
                .optional(optional)
                .readonly(readonly)
                .isGraphqlId(isGraphqlId)
                .docs(docs)
                .selected(selected)
                .graphqlType(graphqlType)
                .annotationAttachments(annotationAttachments)
                .imports(imports);
    }

    /**
     * Attempts to interpret the {@link #type()} field as a {@link TypeData} object. The type field is
     * polymorphic: it can be a plain {@link String} (for primitive/named types) or a structured
     * {@link TypeData} (for array/inline record types). GSON round-trip serialization is used here
     * because the type field may already be a deserialized {@link com.google.gson.JsonObject}.
     *
     * <p>Returns {@code null} when the type field is a plain string (e.g. {@code "int"} or a named
     * type reference), because GSON cannot deserialize a JSON string primitive into a {@link TypeData}
     * object and throws {@link com.google.gson.JsonSyntaxException} in that case. Any other unexpected
     * runtime exception is allowed to propagate so that programming errors are not silently hidden.
     *
     * @return the type field interpreted as {@link TypeData}, or {@code null} when the field holds a
     *         plain string type name
     */
    public TypeData getTypeAsTypeData() {
        try {
            return GSON.fromJson(GSON.toJson(type), TypeData.class);
        } catch (com.google.gson.JsonSyntaxException e) {
            return null;
        }
    }

    public static class MemberBuilder extends AbstractBuilder {
        private Member.MemberKind kind;
        private List<String> refs;
        private Object type;
        private String typeName;
        private String name;
        private String defaultValue;
        private boolean optional = false;
        private boolean readonly = false;
        private boolean isGraphqlId = false;
        private String docs;
        private boolean selected = false;
        private String graphqlType;

        public MemberBuilder() {
        }

        public MemberBuilder kind(Member.MemberKind kind) {
            this.kind = kind;
            return this;
        }

        public MemberBuilder refs(List<String> refs) {
            this.refs = refs;
            return this;
        }

        public MemberBuilder type(Object type) {
            this.type = type;
            return this;
        }

        public MemberBuilder typeName(String typeName) {
            this.typeName = typeName;
            return this;
        }

        public MemberBuilder name(String name) {
            this.name = name;
            return this;
        }

        public MemberBuilder defaultValue(String defaultValue) {
            this.defaultValue = defaultValue;
            return this;
        }

        public MemberBuilder optional(boolean optional) {
            this.optional = optional;
            return this;
        }

        public MemberBuilder readonly(boolean readonly) {
            this.readonly = readonly;
            return this;
        }

        public MemberBuilder isGraphqlId(boolean isGraphqlId) {
            this.isGraphqlId = isGraphqlId;
            return this;
        }

        public MemberBuilder docs(String docs) {
            this.docs = docs;
            return this;
        }

        public MemberBuilder selected(boolean selected) {
            this.selected = selected;
            return this;
        }

        public MemberBuilder graphqlType(String graphqlType) {
            this.graphqlType = graphqlType;
            return this;
        }

        public Member build() {
            Member member = new Member(
                    kind, refs != null ? List.copyOf(refs) : null,
                    type, typeName != null ? typeName : (type instanceof String ? (String) type : null), name,
                    defaultValue, optional, readonly, isGraphqlId, docs,
                    annotationAttachments != null ? List.copyOf(annotationAttachments) : null,
                    imports != null ? Map.copyOf(imports) : null,
                    selected,
                    graphqlType
            );
            this.kind = null;
            this.refs = null;
            this.type = null;
            this.typeName = null;
            this.name = null;
            this.defaultValue = null;
            this.optional = false;
            this.readonly = false;
            this.isGraphqlId = false;
            this.docs = null;
            this.selected = false;
            this.graphqlType = null;
            this.annotationAttachments = null;
            this.imports = null;
            return member;
        }
    }

    public enum MemberKind {
        FIELD, TYPE, NAME
    }
}
