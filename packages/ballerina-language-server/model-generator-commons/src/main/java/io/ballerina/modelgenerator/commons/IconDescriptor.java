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

/**
 * Icon descriptor for a trigger/service artifact, carrying every representation a resolver could
 * determine so a surface can pick the best one it can render.
 *
 * @param url    the icon URL for this entry
 * @param glyph  the icon font glyph name, if any
 * @param color  the icon's display color, if any
 * @param kind   {@code event | file | http | graphql | ai | listener}
 * @param source {@code declared | package | central | derived}
 * @param light  the icon URL for light themes, if any
 * @param dark   the icon URL for dark themes, if any
 * @since 1.9.0
 */
public record IconDescriptor(String url, String glyph, String color, String kind, String source,
                             String light, String dark) {

    public static final String SOURCE_DECLARED = "declared";
    public static final String SOURCE_PACKAGE = "package";
    public static final String SOURCE_CENTRAL = "central";
}
