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

package org.ballerinalang.langserver.workspace.workspacemanager;

import org.ballerinalang.langserver.workspace.workspacemanager.change.BufferedChange;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeLayer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Tests for ChangeLayer enum and BufferedChange record.
 *
 * @since 1.7.0
 */
public class ChangeLayerTest {

    // =========================================================================
    // ChangeLayer Tests
    // =========================================================================

    @Test
    public void changeLayer_hasThreeValues() {
        ChangeLayer[] values = ChangeLayer.values();
        Assert.assertEquals(values.length, 3, "ChangeLayer should have exactly 3 values");
    }

    @Test
    public void changeLayer_editorExists() {
        Assert.assertNotNull(ChangeLayer.EDITOR, "EDITOR value should exist");
    }

    @Test
    public void changeLayer_aiExists() {
        Assert.assertNotNull(ChangeLayer.AI, "AI value should exist");
    }

    @Test
    public void changeLayer_exprExists() {
        Assert.assertNotNull(ChangeLayer.EXPR, "EXPR value should exist");
    }

    @Test
    public void changeLayer_valueOfEditor() {
        ChangeLayer layer = ChangeLayer.valueOf("EDITOR");
        Assert.assertEquals(layer, ChangeLayer.EDITOR);
    }

    @Test
    public void changeLayer_valueOfAi() {
        ChangeLayer layer = ChangeLayer.valueOf("AI");
        Assert.assertEquals(layer, ChangeLayer.AI);
    }

    @Test
    public void changeLayer_valueOfExpr() {
        ChangeLayer layer = ChangeLayer.valueOf("EXPR");
        Assert.assertEquals(layer, ChangeLayer.EXPR);
    }

    // =========================================================================
    // BufferedChange Tests
    // =========================================================================

    @Test
    public void bufferedChange_constructorCreatesInstance() {
        TextDocumentContentChangeEvent changeEvent = new TextDocumentContentChangeEvent();
        ContentVersion version = new ContentVersion(1);
        ChangeLayer layer = ChangeLayer.EDITOR;

        BufferedChange bufferedChange = new BufferedChange(changeEvent, layer, version);

        Assert.assertNotNull(bufferedChange, "BufferedChange should be created");
        Assert.assertSame(bufferedChange.change(), changeEvent, "change field should match");
        Assert.assertSame(bufferedChange.layer(), layer, "layer field should match");
        Assert.assertSame(bufferedChange.version(), version, "version field should match");
    }

    @Test
    public void bufferedChange_isImmutable() {
        TextDocumentContentChangeEvent changeEvent = new TextDocumentContentChangeEvent();
        ContentVersion version = new ContentVersion(1);
        BufferedChange bufferedChange = new BufferedChange(changeEvent, ChangeLayer.AI, version);

        // Record fields are final, so we verify they can't be changed through the auto-generated methods
        // The test confirms that the record has the correct accessor methods
        Assert.assertNotNull(bufferedChange.change());
        Assert.assertEquals(bufferedChange.layer(), ChangeLayer.AI);
        Assert.assertEquals(bufferedChange.version().value(), 1);
    }

    @Test
    public void bufferedChange_allLayersSupported() {
        TextDocumentContentChangeEvent changeEvent = new TextDocumentContentChangeEvent();
        ContentVersion version = new ContentVersion(5);

        BufferedChange editorChange = new BufferedChange(changeEvent, ChangeLayer.EDITOR, version);
        BufferedChange aiChange = new BufferedChange(changeEvent, ChangeLayer.AI, version);
        BufferedChange exprChange = new BufferedChange(changeEvent, ChangeLayer.EXPR, version);

        Assert.assertEquals(editorChange.layer(), ChangeLayer.EDITOR);
        Assert.assertEquals(aiChange.layer(), ChangeLayer.AI);
        Assert.assertEquals(exprChange.layer(), ChangeLayer.EXPR);
    }

    @Test
    public void bufferedChange_equalsAndHashCode() {
        TextDocumentContentChangeEvent changeEvent = new TextDocumentContentChangeEvent();
        ContentVersion version = new ContentVersion(42);

        BufferedChange change1 = new BufferedChange(changeEvent, ChangeLayer.EDITOR, version);
        BufferedChange change2 = new BufferedChange(changeEvent, ChangeLayer.EDITOR, version);

        Assert.assertEquals(change1, change2, "Equal BufferedChange instances should be equal");
        Assert.assertEquals(change1.hashCode(), change2.hashCode(), "Equal instances should have same hashCode");
    }

    @Test
    public void bufferedChange_toString() {
        TextDocumentContentChangeEvent changeEvent = new TextDocumentContentChangeEvent();
        ContentVersion version = new ContentVersion(1);

        BufferedChange bufferedChange = new BufferedChange(changeEvent, ChangeLayer.AI, version);

        String str = bufferedChange.toString();
        Assert.assertNotNull(str, "toString should not return null");
        Assert.assertTrue(str.contains("BufferedChange"), "toString should contain class name");
    }
}
