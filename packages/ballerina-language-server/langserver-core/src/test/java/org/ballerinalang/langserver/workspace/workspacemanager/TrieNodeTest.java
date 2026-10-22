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

import org.ballerinalang.langserver.workspace.workspacemanager.uri.TrieNode;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.Optional;

/**
 * Tests for {@link TrieNode} structural sharing and immutable trie operations.
 *
 * @since 1.7.0
 */
public class TrieNodeTest {

    private static final String FILE_SCHEME = "file";
    private static final String EXPR_SCHEME = "expr";

    /**
     * Verifies lookup on an empty trie returns empty.
     */
    @Test
    public void trieNode_lookup_emptyTrieReturnsEmpty() {
        TrieNode<String> root = new TrieNode<>();

        Assert.assertEquals(root.lookup(segments("workspace", "main.bal")), Optional.empty());
    }

    /**
     * Verifies lookup on an empty trie returns empty for keyed entries.
     */
    @Test
    public void trieNode_lookup_schemeEmptyTrieReturnsEmpty() {
        TrieNode<String> root = new TrieNode<>();

        Assert.assertEquals(root.lookup(segments("workspace", "main.bal"), FILE_SCHEME),
                Optional.empty());
    }

    /**
     * Verifies insert returns a new root and lookup finds the inserted value.
     */
    @Test
    public void trieNode_insert_returnsNewRootWithInsertedValue() {
        TrieNode<String> root = new TrieNode<>();
        TrieNode<String> updated = root.insert(segments("workspace", "main.bal"), "doc-1");

        Assert.assertNotSame(updated, root);
        Assert.assertEquals(updated.lookup(segments("workspace", "main.bal")), Optional.of("doc-1"));
        Assert.assertEquals(root.lookup(segments("workspace", "main.bal")), Optional.empty());
    }

    /**
     * Verifies insert overwrites an existing key without mutating the previous root.
     */
    @Test
    public void trieNode_insert_overwriteExistingKeyLeavesOldRootUnchanged() {
        TrieNode<String> original = new TrieNode<String>().insert(segments("workspace", "main.bal"), "doc-1");
        TrieNode<String> updated = original.insert(segments("workspace", "main.bal"), "doc-2");

        Assert.assertEquals(updated.lookup(segments("workspace", "main.bal")), Optional.of("doc-2"));
        Assert.assertEquals(original.lookup(segments("workspace", "main.bal")), Optional.of("doc-1"));
    }

    /**
     * Verifies remove deletes only the requested value and preserves the previous root.
     */
    @Test
    public void trieNode_remove_existingKeyReturnsRootWithoutValue() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "main.bal"), "doc-1")
                .insert(segments("workspace", "util.bal"), "doc-2");
        TrieNode<String> updated = original.remove(segments("workspace", "main.bal"));

        Assert.assertEquals(updated.lookup(segments("workspace", "main.bal")), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "util.bal")), Optional.of("doc-2"));
        Assert.assertEquals(original.lookup(segments("workspace", "main.bal")), Optional.of("doc-1"));
    }

    /**
     * Verifies removeSubtree evicts every value below the given prefix.
     */
    @Test
    public void trieNode_removeSubtree_evictsAllDescendantsUnderPrefix() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "modules", "auth", "auth.bal"), "auth")
                .insert(segments("workspace", "modules", "auth", "util.bal"), "auth-util")
                .insert(segments("workspace", "modules", "db", "db.bal"), "db");
        TrieNode<String> updated = original.removeSubtree(segments("workspace", "modules", "auth"));

        Assert.assertEquals(updated.lookup(segments("workspace", "modules", "auth", "auth.bal")), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "modules", "auth", "util.bal")), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "modules", "db", "db.bal")), Optional.of("db"));
    }

    /**
     * Verifies insert structurally shares unchanged subtrees.
     */
    @Test
    public void trieNode_insert_structurallySharesUnchangedSubtrees() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "modules", "auth", "auth.bal"), "auth")
                .insert(segments("workspace", "modules", "db", "db.bal"), "db");
        TrieNode<String> updated = original.insert(segments("workspace", "modules", "auth", "service.bal"), "service");

        Assert.assertSame(updated.child("workspace").child("db"), original.child("workspace").child("db"));
    }

    /**
     * Verifies remove structurally shares unchanged subtrees.
     */
    @Test
    public void trieNode_remove_structurallySharesUnchangedSubtrees() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "modules", "auth", "auth.bal"), "auth")
                .insert(segments("workspace", "modules", "auth", "service.bal"), "service")
                .insert(segments("workspace", "modules", "db", "db.bal"), "db");
        TrieNode<String> updated = original.remove(segments("workspace", "modules", "auth", "auth.bal"));

        Assert.assertSame(updated.child("workspace").child("db"), original.child("workspace").child("db"));
    }

    /**
     * Verifies a node can store multiple entries distinguished by scheme.
     */
    @Test
    public void trieNode_insert_samePathDifferentSchemesStoresMultipleEntries() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "project")
                .insert(segments("workspace", "project"), EXPR_SCHEME, "expr-project");

        Assert.assertEquals(root.lookup(segments("workspace", "project"), FILE_SCHEME), Optional.of("project"));
        Assert.assertEquals(root.lookup(segments("workspace", "project"), EXPR_SCHEME),
                Optional.of("expr-project"));
    }

    /**
     * Verifies scheme-keyed insert replaces an existing entry for the same scheme.
     */
    @Test
    public void trieNode_insert_sameSchemeReplacesExistingEntry() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "main.bal"), FILE_SCHEME, "doc-1")
                .insert(segments("workspace", "main.bal"), EXPR_SCHEME, "expr-doc");
        TrieNode<String> updated = original.insert(segments("workspace", "main.bal"), FILE_SCHEME, "doc-2");

        Assert.assertEquals(updated.lookup(segments("workspace", "main.bal"), FILE_SCHEME), Optional.of("doc-2"));
        Assert.assertEquals(updated.lookup(segments("workspace", "main.bal"), EXPR_SCHEME),
                Optional.of("expr-doc"));
        Assert.assertEquals(original.lookup(segments("workspace", "main.bal"), FILE_SCHEME), Optional.of("doc-1"));
    }

    /**
     * Verifies keyed remove only removes the matching scheme entry and preserves siblings.
     */
    @Test
    public void trieNode_remove_matchingSchemePreservesSiblingEntries() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "project")
                .insert(segments("workspace", "project"), EXPR_SCHEME, "expr-project");
        TrieNode<String> updated = original.remove(segments("workspace", "project"), FILE_SCHEME);

        Assert.assertEquals(updated.lookup(segments("workspace", "project"), FILE_SCHEME), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "project"), EXPR_SCHEME),
                Optional.of("expr-project"));
        Assert.assertEquals(original.lookup(segments("workspace", "project"), FILE_SCHEME), Optional.of("project"));
    }

    /**
     * Verifies removing the final scheme entry compacts the leaf node out of the trie.
     */
    @Test
    public void trieNode_remove_lastSchemeCompactsLeafNode() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("main.bal"), FILE_SCHEME, "doc");
        TrieNode<String> updated = original.remove(segments("main.bal"), FILE_SCHEME);

        Assert.assertEquals(updated.lookup(segments("main.bal"), FILE_SCHEME), Optional.empty());
        Assert.assertNull(updated.child("main.bal"));
        Assert.assertNotNull(original.child("main.bal"));
    }

    /**
     * Verifies removeSubtree evicts all schemes under the removed prefix.
     */
    @Test
    public void trieNode_removeSubtree_keyedEntriesEvictsAllDescendants() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "project")
                .insert(segments("workspace", "project"), EXPR_SCHEME, "expr-project")
                .insert(segments("workspace", "project", "main.bal"), FILE_SCHEME, "doc")
                .insert(segments("workspace", "project", "main.bal"), EXPR_SCHEME, "expr-doc")
                .insert(segments("workspace", "other", "util.bal"), FILE_SCHEME, "other");
        TrieNode<String> updated = original.removeSubtree(segments("workspace", "project"));

        Assert.assertEquals(updated.lookup(segments("workspace", "project"), FILE_SCHEME), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "project"), EXPR_SCHEME), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "project", "main.bal"), EXPR_SCHEME),
                Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "other", "util.bal"), FILE_SCHEME),
                Optional.of("other"));
    }

    /**
     * Verifies scheme-scoped removeSubtree removes only the target scheme, leaving other schemes intact.
     */
    @Test
    public void trieNode_removeSubtreeForScheme_keepsOtherSchemes() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "file-project")
                .insert(segments("workspace", "project"), EXPR_SCHEME, "expr-project")
                .insert(segments("workspace", "project", "main.bal"), FILE_SCHEME, "file-doc")
                .insert(segments("workspace", "project", "main.bal"), EXPR_SCHEME, "expr-doc");
        TrieNode<String> updated = original.removeSubtree(segments("workspace", "project"), EXPR_SCHEME);

        Assert.assertEquals(updated.lookup(segments("workspace", "project"), FILE_SCHEME),
                Optional.of("file-project"));
        Assert.assertEquals(updated.lookup(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.of("file-doc"));
        Assert.assertEquals(updated.lookup(segments("workspace", "project"), EXPR_SCHEME), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "project", "main.bal"), EXPR_SCHEME),
                Optional.empty());
    }

    /**
     * Verifies scheme-scoped removeSubtree recurses into deep descendants removing only the target scheme.
     */
    @Test
    public void trieNode_removeSubtreeForScheme_deepDescendants_onlyTargetSchemeRemoved() {
        TrieNode<String> original = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "file-project")
                .insert(segments("workspace", "project", "modules", "auth", "auth.bal"), FILE_SCHEME, "file-auth")
                .insert(segments("workspace", "project"), EXPR_SCHEME, "expr-project")
                .insert(segments("workspace", "project", "modules", "auth", "auth.bal"), EXPR_SCHEME, "expr-auth")
                .insert(segments("workspace", "other"), FILE_SCHEME, "other");
        TrieNode<String> updated = original.removeSubtree(segments("workspace", "project"), EXPR_SCHEME);

        Assert.assertEquals(updated.lookup(segments("workspace", "project"), FILE_SCHEME),
                Optional.of("file-project"));
        Assert.assertEquals(
                updated.lookup(segments("workspace", "project", "modules", "auth", "auth.bal"), FILE_SCHEME),
                Optional.of("file-auth"));
        Assert.assertEquals(updated.lookup(segments("workspace", "project"), EXPR_SCHEME), Optional.empty());
        Assert.assertEquals(
                updated.lookup(segments("workspace", "project", "modules", "auth", "auth.bal"), EXPR_SCHEME),
                Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "other"), FILE_SCHEME), Optional.of("other"));
    }

    /**
     * Verifies scheme-scoped removeSubtree is a no-op when the target scheme has no entries.
     */
    @Test
    public void trieNode_removeSubtreeForScheme_noEntriesForScheme_returnsSameInstance() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "file-project");

        Assert.assertSame(root.removeSubtree(segments("workspace", "project"), EXPR_SCHEME), root);
    }

    /**
     * Verifies insert splits a compressed edge at the divergence point.
     */
    @Test
    public void trieNode_insert_midEdgeSplit_createsCompressedPrefixNode() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project", "modules", "auth", "auth.bal"), FILE_SCHEME, "auth")
                .insert(segments("workspace", "project", "modules", "db", "db.bal"), FILE_SCHEME, "db");

        TrieNode<String> sharedPrefix = root.child("workspace");

        Assert.assertNotNull(sharedPrefix);
        Assert.assertTrue(Arrays.equals(edgeOf(sharedPrefix), segments("workspace", "project", "modules")));
        Assert.assertEquals(root.lookup(segments("workspace", "project", "modules", "auth", "auth.bal"),
                FILE_SCHEME), Optional.of("auth"));
        Assert.assertEquals(root.lookup(segments("workspace", "project", "modules", "db", "db.bal"), FILE_SCHEME),
                Optional.of("db"));
    }

    /**
     * Verifies lookup misses when traversal diverges inside a compressed edge.
     */
    @Test
    public void trieNode_lookup_midEdgeMiss_returnsEmpty() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project", "modules", "auth", "auth.bal"), FILE_SCHEME, "auth")
                .insert(segments("workspace", "project", "tests", "main_test.bal"), FILE_SCHEME, "test");

        Assert.assertEquals(root.lookup(segments("workspace", "project", "generated", "main.bal"), FILE_SCHEME),
                Optional.empty());
    }

    /**
     * Verifies removeSubtree works when the removal prefix lands at a compressed edge boundary.
     */
    @Test
    public void trieNode_removeSubtree_compressedBoundaryEvictsMatchingBranch() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project", "modules", "auth", "auth.bal"), FILE_SCHEME, "auth")
                .insert(segments("workspace", "project", "modules", "db", "db.bal"), FILE_SCHEME, "db")
                .insert(segments("workspace", "project", "tests", "main_test.bal"), FILE_SCHEME, "test");
        TrieNode<String> updated = root.removeSubtree(segments("workspace", "project", "modules"));

        Assert.assertEquals(updated.lookup(segments("workspace", "project", "modules", "auth", "auth.bal"),
                FILE_SCHEME), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "project", "modules", "db", "db.bal"),
                FILE_SCHEME), Optional.empty());
        Assert.assertEquals(updated.lookup(segments("workspace", "project", "tests", "main_test.bal"),
                FILE_SCHEME), Optional.of("test"));
    }

    /**
     * Verifies validation rejects null path segments.
     */
    @Test(expectedExceptions = NullPointerException.class)
    public void trieNode_insert_nullPathSegment_throwsNullPointerException() {
        new TrieNode<String>().insert(new String[]{"workspace", null, "main.bal"}, "doc");
    }

    /**
     * Verifies validation rejects empty path segments.
     */
    @Test(expectedExceptions = IllegalArgumentException.class)
    public void trieNode_insert_emptyPathSegment_throwsIllegalArgumentException() {
        new TrieNode<String>().insert(new String[]{"workspace", "", "main.bal"}, "doc");
    }

    /**
     * Verifies removing a non-existent key is a no-op that returns the same root instance.
     */
    @Test
    public void trieNode_remove_nonExistentKey_returnsSameInstance() {
        TrieNode<String> root = new TrieNode<String>().insert(segments("workspace", "main.bal"), "doc");

        Assert.assertSame(root.remove(segments("workspace", "util.bal")), root);
    }

    /**
     * Verifies removing a non-existent subtree prefix is a no-op that returns the same root instance.
     */
    @Test
    public void trieNode_removeSubtree_nonExistentPrefix_returnsSameInstance() {
        TrieNode<String> root = new TrieNode<String>().insert(segments("workspace", "main.bal"), "doc");

        Assert.assertSame(root.removeSubtree(segments("workspace", "missing")), root);
    }

    /**
     * Verifies single-segment paths work correctly.
     */
    @Test
    public void trieNode_insert_singleSegmentPath_resolvesValue() {
        TrieNode<String> root = new TrieNode<String>().insert(segments("main.bal"), "doc");

        Assert.assertEquals(root.lookup(segments("main.bal")), Optional.of("doc"));
    }

    /**
     * Verifies deep paths continue to resolve correctly.
     */
    @Test
    public void trieNode_insert_deepPath_resolvesValue() {
        String[] deepPath = segments("a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "main.bal");
        TrieNode<String> root = new TrieNode<String>().insert(deepPath, "doc");

        Assert.assertEquals(root.lookup(deepPath), Optional.of("doc"));
    }

    /**
     * Verifies removeSubtree on an empty trie returns the same empty root.
     */
    @Test
    public void trieNode_removeSubtree_emptyTrie_returnsSameEmptyRoot() {
        TrieNode<String> root = new TrieNode<>();

        Assert.assertSame(root.removeSubtree(segments("workspace")), root);
    }

    // ── lookupNearest ─────────────────────────────────────────────────────────

    /**
     * Verifies lookupNearest on an empty trie returns empty.
     */
    @Test
    public void trieNode_lookupNearest_emptyTrie_returnsEmpty() {
        TrieNode<String> root = new TrieNode<>();

        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.empty());
    }

    /**
     * Verifies lookupNearest returns the value when an exact match exists at the full path.
     */
    @Test
    public void trieNode_lookupNearest_exactMatch_returnsValue() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project", "main.bal"), FILE_SCHEME, "doc");

        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.of("doc"));
    }

    /**
     * Verifies lookupNearest returns the ancestor value when the queried path is deeper than any registered path.
     */
    @Test
    public void trieNode_lookupNearest_ancestorRegistered_returnsAncestorValue() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "project");

        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.of("project"));
        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "modules", "auth", "auth.bal"),
                FILE_SCHEME), Optional.of("project"));
    }

    /**
     * Verifies lookupNearest returns the deepest ancestor when multiple ancestors have values.
     */
    @Test
    public void trieNode_lookupNearest_multipleAncestors_returnsDeepest() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace"), FILE_SCHEME, "workspace")
                .insert(segments("workspace", "project"), FILE_SCHEME, "project");

        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.of("project"));
    }

    /**
     * Verifies lookupNearest prefers an exact match over a shallower ancestor value.
     */
    @Test
    public void trieNode_lookupNearest_exactMatchPreferredOverAncestor() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "project")
                .insert(segments("workspace", "project", "main.bal"), FILE_SCHEME, "doc");

        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.of("doc"));
    }

    /**
     * Verifies lookupNearest discriminates by scheme — a value registered under one scheme is not
     * visible under another.
     */
    @Test
    public void trieNode_lookupNearest_schemeDiscrimination_returnsSchemeSpecificAncestor() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "file-project")
                .insert(segments("workspace", "project"), EXPR_SCHEME, "expr-project");

        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.of("file-project"));
        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), EXPR_SCHEME),
                Optional.of("expr-project"));
    }

    /**
     * Verifies lookupNearest returns empty when the path diverges before any registered ancestor.
     */
    @Test
    public void trieNode_lookupNearest_pathDivergesBeforeAnyValue_returnsEmpty() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project-a", "main.bal"), FILE_SCHEME, "doc");

        Assert.assertEquals(root.lookupNearest(segments("workspace", "project-b", "main.bal"), FILE_SCHEME),
                Optional.empty());
    }

    /**
     * Verifies lookupNearest stops at the registered ancestor and does not pick up values from sibling branches.
     */
    @Test
    public void trieNode_lookupNearest_siblingBranch_notReturnedForUnrelatedPath() {
        TrieNode<String> root = new TrieNode<String>()
                .insert(segments("workspace", "project"), FILE_SCHEME, "project")
                .insert(segments("workspace", "project", "modules", "auth", "auth.bal"), FILE_SCHEME, "auth-doc");

        // Querying a path that shares the project prefix but goes to a different leaf
        // should return "project" not "auth-doc"
        Assert.assertEquals(root.lookupNearest(segments("workspace", "project", "main.bal"), FILE_SCHEME),
                Optional.of("project"));
    }

    private String[] segments(String... segments) {
        return segments;
    }

    @SuppressWarnings("unchecked")
    private String[] edgeOf(TrieNode<String> node) {
        try {
            Field edgeField = TrieNode.class.getDeclaredField("edge");
            edgeField.setAccessible(true);
            return ((String[]) edgeField.get(node)).clone();
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("Unable to read trie edge for assertions", e);
        }
    }
}
