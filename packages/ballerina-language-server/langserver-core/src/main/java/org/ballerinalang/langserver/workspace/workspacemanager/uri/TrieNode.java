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

package org.ballerinalang.langserver.workspace.workspacemanager.uri;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import javax.annotation.Nonnull;

/**
 * Immutable persistent trie node keyed by path segments.
 *
 * <p>Every mutation returns a new root while unchanged subtrees are shared by reference.
 * This enables lock-free readers to traverse a stable snapshot without synchronization.</p>
 *
 * @param <V> value type stored at terminal nodes
 * @since 1.7.0
 */
public final class TrieNode<V> {
    private static final String DEFAULT_SCHEME = "file";
    private static final String[] EMPTY_EDGE = new String[0];
    private static final TrieNode<?> EMPTY = new TrieNode<>(EMPTY_EDGE, Map.of(), null, null);

    private final String[] edge;
    private final Map<String, TrieNode<V>> children;
    private final V fileValue;
    private final Map<String, V> overflowValues;

    /**
     * Creates an empty trie node.
     */
    public TrieNode() {
        this(EMPTY_EDGE, Map.of(), null, null);
    }

    private TrieNode(String[] edge, Map<String, TrieNode<V>> children, V fileValue, Map<String, V> overflowValues) {
        this.edge = edge;
        this.children = children;
        this.fileValue = fileValue;
        this.overflowValues = overflowValues;
    }

    /**
     * Returns a new trie root with the value stored at the given path.
     *
     * <p>This compatibility overload uses the default `(file, DOCUMENT)` key.</p>
     *
     * @param pathSegments path segments from root to leaf
     * @param newValue value to store at the target path
     * @return new trie root containing the inserted value
     */
    public @Nonnull TrieNode<V> insert(@Nonnull String[] pathSegments, @Nonnull V newValue) {
        return insert(pathSegments, DEFAULT_SCHEME, newValue);
    }

    /**
     * Returns a new trie root with the scheme-keyed value stored at the given path.
     *
     * @param pathSegments path segments from root to leaf
     * @param scheme URI scheme discriminator
     * @param newValue value to store at the target path
     * @return new trie root containing the inserted value
     */
    public @Nonnull TrieNode<V> insert(@Nonnull String[] pathSegments, @Nonnull String scheme, @Nonnull V newValue) {
        validatePathSegments(pathSegments);
        validateScheme(scheme);
        return insert(pathSegments, 0, scheme, newValue);
    }

    /**
     * Looks up the value stored at the given path.
     *
     * <p>This compatibility overload uses the default `(file, DOCUMENT)` key.</p>
     *
     * @param pathSegments path segments from root to leaf
     * @return optional containing the stored value when present
     */
    public @Nonnull Optional<V> lookup(@Nonnull String[] pathSegments) {
        return lookup(pathSegments, DEFAULT_SCHEME);
    }

    /**
     * Looks up the scheme-keyed value stored at the given path.
     *
     * @param pathSegments path segments from root to leaf
     * @param scheme URI scheme discriminator
     * @return optional containing the stored value when present
     */
    public @Nonnull Optional<V> lookup(@Nonnull String[] pathSegments, @Nonnull String scheme) {
        validatePathSegments(pathSegments);
        validateScheme(scheme);

        TrieNode<V> node = this;
        int depth = 0;
        while (true) {
            int matchLength = node.commonPrefixLength(pathSegments, depth);
            if (matchLength < node.edge.length) {
                return Optional.empty();
            }
            depth += matchLength;
            if (depth == pathSegments.length) {
                return node.lookupValue(scheme);
            }
            node = node.children.get(pathSegments[depth]);
            if (node == null) {
                return Optional.empty();
            }
        }
    }

    /**
     * Looks up the deepest ancestor value along the given path for the supplied scheme.
     *
     * <p>Traverses the trie following the path segments, tracking the most recently seen
     * value. If no exact match exists at the full path depth, returns the deepest ancestor's
     * value. This enables hierarchical resolution — e.g., finding a project entry when
     * querying a document path that has not been explicitly registered.</p>
     *
     * @param pathSegments path segments from root to leaf
     * @param scheme URI scheme discriminator
     * @return optional containing the deepest ancestor value when present
     */
    public @Nonnull Optional<V> lookupNearest(@Nonnull String[] pathSegments, @Nonnull String scheme) {
        validatePathSegments(pathSegments);
        validateScheme(scheme);

        TrieNode<V> node = this;
        int depth = 0;
        V nearest = null;
        while (true) {
            int matchLength = node.commonPrefixLength(pathSegments, depth);
            if (matchLength < node.edge.length) {
                break;
            }
            depth += matchLength;
            V current = node.lookupValue(scheme).orElse(null);
            if (current != null) {
                nearest = current;
            }
            if (depth == pathSegments.length) {
                break;
            }
            node = node.children.get(pathSegments[depth]);
            if (node == null) {
                break;
            }
        }
        return Optional.ofNullable(nearest);
    }

    /**
     * Returns a new trie root with the value at the given path removed.
     *
     * <p>This compatibility overload uses the default `(file, DOCUMENT)` key.</p>
     *
     * @param pathSegments path segments from root to leaf
     * @return new trie root without the removed value
     */
    public @Nonnull TrieNode<V> remove(@Nonnull String[] pathSegments) {
        return remove(pathSegments, DEFAULT_SCHEME);
    }

    /**
     * Returns a new trie root with the scheme-keyed value at the given path removed.
     *
     * @param pathSegments path segments from root to leaf
     * @param scheme URI scheme discriminator
     * @return new trie root without the removed value
     */
    public @Nonnull TrieNode<V> remove(@Nonnull String[] pathSegments, @Nonnull String scheme) {
        validatePathSegments(pathSegments);
        validateScheme(scheme);
        return remove(pathSegments, 0, scheme);
    }

    /**
     * Returns a new trie root with the entire subtree at the given prefix removed.
     *
     * @param prefixSegments prefix identifying the subtree root
     * @return new trie root without the removed subtree
     */
    public @Nonnull TrieNode<V> removeSubtree(@Nonnull String[] prefixSegments) {
        validatePathSegments(prefixSegments);
        return removeSubtree(prefixSegments, 0);
    }

    /**
     * Returns a new trie root with all values for the given scheme removed at and below the given
     * prefix. Values registered under other schemes are left intact.
     *
     * @param prefixSegments prefix identifying the subtree root
     * @param scheme the scheme discriminator — only entries for this scheme are removed
     * @return new trie root without the removed scheme entries
     */
    public @Nonnull TrieNode<V> removeSubtree(@Nonnull String[] prefixSegments, @Nonnull String scheme) {
        validatePathSegments(prefixSegments);
        validateScheme(scheme);
        return removeSubtree(prefixSegments, 0, scheme);
    }

    public TrieNode<V> child(@Nonnull String segment) {
        return children.get(segment);
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (!(obj instanceof TrieNode<?> other)) {
            return false;
        }
        return Arrays.equals(edge, other.edge)
                && Objects.equals(children, other.children)
                && Objects.equals(fileValue, other.fileValue)
                && Objects.equals(overflowValues, other.overflowValues);
    }

    @Override
    public int hashCode() {
        return Objects.hash(Arrays.hashCode(edge), children, fileValue, overflowValues);
    }

    @Override
    public String toString() {
        return "TrieNode[edge=" + Arrays.toString(edge) + ", hasValue=" + hasValue()
                + ", children=" + children.keySet() + "]";
    }

    private TrieNode<V> insert(String[] pathSegments, int depth, String scheme, V newValue) {
        int matchLength = commonPrefixLength(pathSegments, depth);
        if (matchLength < edge.length) {
            return splitAndInsert(pathSegments, depth, scheme, newValue, matchLength);
        }

        int nextDepth = depth + matchLength;
        if (nextDepth == pathSegments.length) {
            return withValue(scheme, newValue);
        }

        String nextSegment = pathSegments[nextDepth];
        TrieNode<V> currentChild = children.get(nextSegment);
        if (currentChild == null) {
            return withUpdatedChild(nextSegment, leafNode(pathSegments, nextDepth, scheme, newValue));
        }

        TrieNode<V> updatedChild = currentChild.insert(pathSegments, nextDepth, scheme, newValue);
        if (updatedChild == currentChild) {
            return this;
        }
        return withUpdatedChild(nextSegment, updatedChild);
    }

    private TrieNode<V> remove(String[] pathSegments, int depth, String scheme) {
        int matchLength = commonPrefixLength(pathSegments, depth);
        if (matchLength < edge.length) {
            return this;
        }

        int nextDepth = depth + matchLength;
        if (nextDepth == pathSegments.length) {
            return withoutValue(scheme);
        }

        String nextSegment = pathSegments[nextDepth];
        TrieNode<V> currentChild = children.get(nextSegment);
        if (currentChild == null) {
            return this;
        }

        TrieNode<V> updatedChild = currentChild.remove(pathSegments, nextDepth, scheme);
        if (updatedChild == currentChild) {
            return this;
        }
        return withUpdatedChild(nextSegment, updatedChild);
    }

    private TrieNode<V> removeSubtree(String[] prefixSegments, int depth) {
        int matchLength = commonPrefixLength(prefixSegments, depth);
        if (matchLength < edge.length) {
            return depth + matchLength == prefixSegments.length ? emptyNode() : this;
        }

        int nextDepth = depth + matchLength;
        if (nextDepth == prefixSegments.length) {
            return emptyNode();
        }

        String nextSegment = prefixSegments[nextDepth];
        TrieNode<V> currentChild = children.get(nextSegment);
        if (currentChild == null) {
            return this;
        }

        TrieNode<V> updatedChild = currentChild.removeSubtree(prefixSegments, nextDepth);
        if (updatedChild == currentChild) {
            return this;
        }
        return withUpdatedChild(nextSegment, updatedChild);
    }

    private TrieNode<V> removeSubtree(String[] prefixSegments, int depth, String scheme) {
        int matchLength = commonPrefixLength(prefixSegments, depth);
        if (matchLength < edge.length) {
            return depth + matchLength == prefixSegments.length ? removeSchemeFromSubtree(scheme) : this;
        }

        int nextDepth = depth + matchLength;
        if (nextDepth == prefixSegments.length) {
            return removeSchemeFromSubtree(scheme);
        }

        String nextSegment = prefixSegments[nextDepth];
        TrieNode<V> currentChild = children.get(nextSegment);
        if (currentChild == null) {
            return this;
        }

        TrieNode<V> updatedChild = currentChild.removeSubtree(prefixSegments, nextDepth, scheme);
        if (updatedChild == currentChild) {
            return this;
        }
        return withUpdatedChild(nextSegment, updatedChild);
    }

    private TrieNode<V> removeSchemeFromSubtree(String scheme) {
        V newFileValue = DEFAULT_SCHEME.equals(scheme) ? null : fileValue;
        Map<String, V> newOverflow = overflowValues;
        if (!DEFAULT_SCHEME.equals(scheme) && overflowValues != null && overflowValues.containsKey(scheme)) {
            Map<String, V> updated = new HashMap<>(overflowValues);
            updated.remove(scheme);
            newOverflow = updated;
        }

        Map<String, TrieNode<V>> newChildren = null;
        for (Map.Entry<String, TrieNode<V>> entry : children.entrySet()) {
            TrieNode<V> updatedChild = entry.getValue().removeSchemeFromSubtree(scheme);
            if (updatedChild != entry.getValue()) {
                if (newChildren == null) {
                    newChildren = new HashMap<>(children);
                }
                if (updatedChild.isEmptyNode()) {
                    newChildren.remove(entry.getKey());
                } else {
                    newChildren.put(entry.getKey(), updatedChild);
                }
            }
        }

        Map<String, TrieNode<V>> finalChildren = newChildren != null ? newChildren : children;
        boolean valueChanged = newFileValue != fileValue || newOverflow != overflowValues;
        boolean childrenChanged = newChildren != null;

        if (!valueChanged && !childrenChanged) {
            return this;
        }

        return compact(edge, finalChildren, newFileValue, newOverflow);
    }

    private boolean isEmptyNode() {
        return !hasValue() && children.isEmpty();
    }

    private boolean hasValue() {
        return fileValue != null || overflowValues != null;
    }

    private Optional<V> lookupValue(String scheme) {
        if (DEFAULT_SCHEME.equals(scheme)) {
            return Optional.ofNullable(fileValue);
        }
        if (overflowValues == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(overflowValues.get(scheme));
    }

    private TrieNode<V> splitAndInsert(String[] pathSegments, int depth, String scheme, V newValue, int matchLength) {
        String[] prefix = slice(edge, 0, matchLength);
        TrieNode<V> existingChild = new TrieNode<>(slice(edge, matchLength, edge.length), children, fileValue,
                overflowValues);

        if (depth + matchLength == pathSegments.length) {
            return compact(prefix, Map.of(existingChild.edge[0], existingChild), fileValueFor(scheme, newValue),
                    overflowValuesFor(scheme, newValue));
        }

        TrieNode<V> newChild = leafNode(pathSegments, depth + matchLength, scheme, newValue);
        Map<String, TrieNode<V>> splitChildren = new HashMap<>(2);
        splitChildren.put(existingChild.edge[0], existingChild);
        splitChildren.put(newChild.edge[0], newChild);
        return compact(prefix, splitChildren, null, null);
    }

    private TrieNode<V> withValue(String scheme, V newValue) {
        if (DEFAULT_SCHEME.equals(scheme)) {
            if (Objects.equals(fileValue, newValue)) {
                return this;
            }
            return new TrieNode<>(edge, children, newValue, overflowValues);
        }

        if (overflowValues != null && Objects.equals(overflowValues.get(scheme), newValue)) {
            return this;
        }
        Map<String, V> updatedOverflow = overflowValues == null ? new HashMap<>() : new HashMap<>(overflowValues);
        updatedOverflow.put(scheme, newValue);
        return new TrieNode<>(edge, children, fileValue, Map.copyOf(updatedOverflow));
    }

    private TrieNode<V> withoutValue(String scheme) {
        if (DEFAULT_SCHEME.equals(scheme)) {
            if (fileValue == null) {
                return this;
            }
            return compact(edge, children, null, overflowValues);
        }

        if (overflowValues == null || !overflowValues.containsKey(scheme)) {
            return this;
        }
        Map<String, V> updatedOverflow = new HashMap<>(overflowValues);
        updatedOverflow.remove(scheme);
        return compact(edge, children, fileValue, updatedOverflow);
    }

    private TrieNode<V> withUpdatedChild(String segment, TrieNode<V> updatedChild) {
        Map<String, TrieNode<V>> updatedChildren = new HashMap<>(children);
        if (updatedChild.isEmptyNode()) {
            updatedChildren.remove(segment);
        } else {
            updatedChildren.put(segment, updatedChild);
        }
        return compact(edge, updatedChildren, fileValue, overflowValues);
    }

    private int commonPrefixLength(String[] pathSegments, int depth) {
        int matchLength = 0;
        while (matchLength < edge.length && depth + matchLength < pathSegments.length
                && edge[matchLength].equals(pathSegments[depth + matchLength])) {
            matchLength++;
        }
        return matchLength;
    }

    private static void validateScheme(String scheme) {
        if (scheme == null) {
            throw new NullPointerException("scheme must not be null");
        }
        if (scheme.isEmpty()) {
            throw new IllegalArgumentException("scheme must not be empty");
        }
    }

    private TrieNode<V> compact(String[] candidateEdge, Map<String, TrieNode<V>> candidateChildren,
                                V candidateFileValue, Map<String, V> candidateOverflowValues) {
        Map<String, TrieNode<V>> normalizedChildren = candidateChildren.isEmpty()
                ? Map.of() : Map.copyOf(candidateChildren);
        Map<String, V> normalizedOverflowValues = normalizeOverflowValues(candidateOverflowValues);

        if (candidateFileValue == null && normalizedOverflowValues == null && normalizedChildren.isEmpty()) {
            return emptyNode();
        }

        if (candidateEdge.length > 0 && candidateFileValue == null
                && normalizedOverflowValues == null && normalizedChildren.size() == 1) {
            TrieNode<V> onlyChild = normalizedChildren.values().iterator().next();
            return new TrieNode<>(concat(candidateEdge, onlyChild.edge), onlyChild.children, onlyChild.fileValue,
                    onlyChild.overflowValues);
        }

        return new TrieNode<>(candidateEdge.length == 0 ? EMPTY_EDGE : candidateEdge, normalizedChildren,
                candidateFileValue, normalizedOverflowValues);
    }

    private static void validatePathSegments(String[] pathSegments) {
        if (pathSegments == null) {
            throw new NullPointerException("pathSegments must not be null");
        }
        for (String segment : pathSegments) {
            if (segment == null) {
                throw new NullPointerException("pathSegments must not contain null segments");
            }
            if (segment.isEmpty()) {
                throw new IllegalArgumentException("pathSegments must not contain empty segments");
            }
        }
    }

    private static <V> TrieNode<V> leafNode(String[] pathSegments, int start, String scheme, V value) {
        return new TrieNode<>(slice(pathSegments, start, pathSegments.length), Map.of(), fileValueFor(scheme, value),
                overflowValuesFor(scheme, value));
    }

    private static String[] slice(String[] source, int from, int to) {
        return Arrays.copyOfRange(source, from, to);
    }

    private static String[] concat(String[] left, String[] right) {
        String[] merged = Arrays.copyOf(left, left.length + right.length);
        System.arraycopy(right, 0, merged, left.length, right.length);
        return merged;
    }

    private static <V> V fileValueFor(String scheme, V value) {
        return DEFAULT_SCHEME.equals(scheme) ? value : null;
    }

    private static <V> Map<String, V> overflowValuesFor(String scheme, V value) {
        return DEFAULT_SCHEME.equals(scheme) ? null : Map.of(scheme, value);
    }

    private static <V> Map<String, V> normalizeOverflowValues(Map<String, V> candidateOverflowValues) {
        if (candidateOverflowValues == null || candidateOverflowValues.isEmpty()) {
            return null;
        }
        return Map.copyOf(candidateOverflowValues);
    }

    @SuppressWarnings("unchecked")
    private static <V> TrieNode<V> emptyNode() {
        return (TrieNode<V>) EMPTY;
    }
}
