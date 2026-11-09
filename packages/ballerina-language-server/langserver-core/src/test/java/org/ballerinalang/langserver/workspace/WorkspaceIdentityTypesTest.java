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

package org.ballerinalang.langserver.workspace;

import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.net.URI;

/**
 * Tests workspace identity value objects and bounded-context package scaffolding.
 *
 * @since 1.7.0
 */
public class WorkspaceIdentityTypesTest {

    /**
     * Verifies each supported URI scheme maps to the expected variant.
     */
    // RED: this test should fail - workspace identity types are not yet implemented
    @Test
    public void documentUri_withSupportedSchemes_createsExpectedVariant() {
        DocumentUri.FileUri fileUri = new DocumentUri.FileUri(URI.create("file:///tmp/main.bal"));
        DocumentUri.ExprUri exprUri = new DocumentUri.ExprUri(URI.create("expr:///tmp/main.bal"));
        DocumentUri.AiUri aiUri = new DocumentUri.AiUri(URI.create("ai:///tmp/main.bal"));

        Assert.assertEquals(fileUri.uri().getScheme(), "file");
        Assert.assertEquals(exprUri.uri().getScheme(), "expr");
        Assert.assertEquals(aiUri.uri().getScheme(), "ai");
    }

    /**
     * Verifies URI-variant constructors reject mismatched schemes.
     *
     * @param variant target URI variant
     * @param uri URI with an invalid scheme for the variant
     */
    @Test(dataProvider = "documentUriMismatchCases")
    public void documentUri_withMismatchedScheme_throws(String variant, URI uri) {
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            switch (variant) {
                case "file" -> new DocumentUri.FileUri(uri);
                case "expr" -> new DocumentUri.ExprUri(uri);
                case "ai" -> new DocumentUri.AiUri(uri);
                default -> throw new IllegalArgumentException("Unsupported test variant");
            }
        });
    }

    /**
     * Provides mismatched URI schemes for each document URI variant.
     *
     * @return mismatch cases
     */
    @DataProvider(name = "documentUriMismatchCases")
    public Object[][] documentUriMismatchCases() {
        return new Object[][]{
                {"file", URI.create("expr:///tmp/file.bal")},
                {"expr", URI.create("ai:///tmp/file.bal")},
                {"ai", URI.create("file:///tmp/file.bal")}
        };
    }

    @Test
    public void fileUri_equalsAndHashCodeIgnoreTrailingSlash() {
        DocumentUri.FileUri pathUri = new DocumentUri.FileUri(URI.create("file:///tmp/project/"));
        DocumentUri.FileUri compilerEventUri = new DocumentUri.FileUri(URI.create("file:///tmp/project"));

        Assert.assertEquals(pathUri, compilerEventUri);
        Assert.assertEquals(pathUri.hashCode(), compilerEventUri.hashCode());
        Assert.assertEquals(pathUri.uri(), URI.create("file:///tmp/project/"));
    }

    @Test
    public void nonFileUriEquality_preservesTrailingSlashSemantics() {
        Assert.assertNotEquals(new DocumentUri.ExprUri(URI.create("expr:///tmp/project/")),
                new DocumentUri.ExprUri(URI.create("expr:///tmp/project")));
        Assert.assertNotEquals(new DocumentUri.AiUri(URI.create("ai:///tmp/project/")),
                new DocumentUri.AiUri(URI.create("ai:///tmp/project")));
    }

    /**
     * Verifies content-version comparison ordering semantics.
     */
    @Test
    public void contentVersion_compareTo_ordersByVersion() {
        ContentVersion older = new ContentVersion(4);
        ContentVersion newer = new ContentVersion(5);

        Assert.assertTrue(older.compareTo(newer) < 0);
        Assert.assertTrue(newer.compareTo(older) > 0);
    }

    /**
     * Verifies {@code next()} returns a version incremented by one.
     */
    @Test
    public void contentVersion_next_returnsIncrementedVersion() {
        ContentVersion version = new ContentVersion(10);
        Assert.assertEquals(version.next(), new ContentVersion(11));
    }

}
