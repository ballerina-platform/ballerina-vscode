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

package io.ballerina.flowmodelgenerator.extension.response;

import io.ballerina.flowmodelgenerator.core.TypeShapeFinder.FieldShape;

import java.util.List;
import java.util.Map;

/**
 * What a named type holds: the values it allows, as expressions, and what each field of a record type holds.
 *
 * @since 1.7.0
 */
public class TypeShapeResponse extends AbstractFlowModelResponse {

    private List<String> values = List.of();
    private Map<String, FieldShape> fields = Map.of();

    public List<String> getValues() {
        return values;
    }

    public void setValues(List<String> values) {
        this.values = values;
    }

    public Map<String, FieldShape> getFields() {
        return fields;
    }

    public void setFields(Map<String, FieldShape> fields) {
        this.fields = fields;
    }
}
