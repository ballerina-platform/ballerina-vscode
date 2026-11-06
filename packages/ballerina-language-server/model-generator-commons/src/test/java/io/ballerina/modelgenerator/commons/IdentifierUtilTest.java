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

import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Tests for {@link IdentifierUtil}. The same vectors are used by the webview display helper tests
 * ({@code ballerina-core/src/test/source-name-utils.test.ts}), so the two stay in step.
 *
 * @since 1.7.0
 */
public class IdentifierUtilTest {

    @DataProvider(name = "identifiers")
    public Object[][] identifiers() {
        return new Object[][]{
                // input, source form, plain form
                {"name", "name", "name"},
                {"issue-number", "issue\\-number", "issue-number"},
                {"issue\\-number", "issue\\-number", "issue-number"},
                {"issue\\\\\\-number", "issue\\-number", "issue-number"},
                {"type", "'type", "type"},
                {"'type", "'type", "type"},
                {"'name", "name", "name"},
                {"'type-x", "type\\-x", "type-x"},
                {"key", "key", "key"},
                {"string", "'string", "string"},
                {"_", "_", "_"},
                {"1st", "\\1st", "1st"},
                {"\\1st", "\\1st", "1st"},
                {"a1", "a1", "a1"},
                {"first name", "first\\ name", "first name"},
                {"a.b", "a\\.b", "a.b"},
                {"a@b$c", "a\\@b\\$c", "a@b$c"},
                {"a\\u{2D}b", "a\\-b", "a-b"},
                {"a\\u{5C}b", "a\\u{5C}b", "a\\b"},
                {"_x", "_x", "_x"},
                {"été", "été", "été"},
                {"  padded  ", "padded", "  padded  "},
        };
    }

    @Test(dataProvider = "identifiers")
    public void testToSourceIdentifier(String input, String source, String plain) {
        Assert.assertEquals(IdentifierUtil.toSourceIdentifier(input), source);
        // Running it again on its own output must not change it
        Assert.assertEquals(IdentifierUtil.toSourceIdentifier(source), source);
        Assert.assertTrue(IdentifierUtil.isSourceIdentifier(source));
        Assert.assertEquals(IdentifierUtil.toPlainName(input), plain);
    }

    @Test
    public void testNullAndBlank() {
        Assert.assertNull(IdentifierUtil.toSourceIdentifier(null));
        Assert.assertNull(IdentifierUtil.toPlainName(null));
        Assert.assertNull(IdentifierUtil.toSourcePath(null));
        Assert.assertEquals(IdentifierUtil.toSourceIdentifier(""), "");
        Assert.assertEquals(IdentifierUtil.toSourcePath(""), "");
    }

    @DataProvider(name = "bindingNames")
    public Object[][] bindingNames() {
        return new Object[][]{
                // input, source form
                {"x", "x"},
                {"issue-number", "issue\\-number"},
                {"issue\\-number", "issue\\-number"},
                {"type", "'type"},
                {"'type", "'type"},
                {"key", "key"},
                {"1st", "\\1st"},
                {"first name", "first\\ name"},
                {"[a, b]", "[a, b]"},
                {"{a, b}", "{a, b}"},
                {"_", "_"},
                {"self.conn", "self.conn"},
                {"self.my-conn", "self.my\\-conn"},
        };
    }

    @Test(dataProvider = "bindingNames")
    public void testEscapeIfNeeded(String input, String source) {
        Assert.assertEquals(IdentifierUtil.escapeIfNeeded(input), source);
        Assert.assertEquals(IdentifierUtil.escapeIfNeeded(source), source);
    }

    @DataProvider(name = "paths")
    public Object[][] paths() {
        return new Object[][]{
                // input, source form, plain form
                {"/", "/", "/"},
                {".", ".", "."},
                {"/issues-memox", "/issues\\-memox", "/issues-memox"},
                {"/issues\\-memox", "/issues\\-memox", "/issues-memox"},
                {"/issues\\\\\\-memox", "/issues\\-memox", "/issues-memox"},
                {"/a@b", "/a\\@b", "/a@b"},
                {"/api/v1.0/type", "/api/v1\\.0/'type", "/api/v1.0/type"},
                {"orders/[int id]/line-items", "orders/[int id]/line\\-items", "orders/[int id]/line-items"},
                {"[string... rest]", "[string... rest]", "[string... rest]"},
                {"files/[string... rest]", "files/[string... rest]", "files/[string... rest]"},
                {"v1/2024", "v1/\\2024", "v1/2024"},
                {"/a[b/c", "/a\\[b/c", "/a[b/c"},
                {"\"/literal-path\"", "\"/literal-path\"", "\"/literal-path\""},
        };
    }

    @Test(dataProvider = "paths")
    public void testToSourcePath(String input, String source, String plain) {
        Assert.assertEquals(IdentifierUtil.toSourcePath(input), source);
        Assert.assertEquals(IdentifierUtil.toSourcePath(source), source);
        Assert.assertEquals(IdentifierUtil.toPlainPath(input), plain);
    }
}
