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

package io.ballerina.servicemodelgenerator.extension.settings;

/**
 * A field of a service's config annotation, as the designer's Service Settings panel shows it.
 *
 * @param field        the field name
 * @param label        the name the designer shows
 * @param description  one line on what the field does; null for a field with no descriptor
 * @param editorKind   the editor to use; {@link #ADVANCED} for a field with no descriptor, which is edited in the full
 *                     config form
 * @param defaultValue the module's value when the field is absent; may be null
 * @param placeholder  an example value for an empty editor; may be null
 * @param value        the value set in source, as written; null when the field is absent
 */
public record ServiceSetting(String field, String label, String description, String editorKind, String defaultValue,
                             String placeholder, String value) {

    public static final String ADVANCED = "advanced";

    static ServiceSetting of(ServiceSettingDescriptors.Descriptor descriptor, String value) {
        return new ServiceSetting(descriptor.field(), descriptor.label(), descriptor.description(),
                descriptor.editorKind(), descriptor.defaultValue(), descriptor.placeholder(), value);
    }

    static ServiceSetting advanced(String field, String value) {
        return new ServiceSetting(field, field, null, ADVANCED, null, null, value);
    }
}
