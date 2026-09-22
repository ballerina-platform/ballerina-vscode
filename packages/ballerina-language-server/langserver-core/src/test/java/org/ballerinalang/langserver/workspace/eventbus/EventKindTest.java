/*
 *  Copyright (c) 2026, WSO2 LLC. (http://wso2.com)
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

package org.ballerinalang.langserver.workspace.eventbus;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Tests for {@link EventKind} enum values per ADR-046, ADR-049, and ADR-041.
 *
 * @since 1.7.0
 */
public class EventKindTest {

    private static final Set<String> ALL_EVENT_NAMES = Arrays.stream(EventKind.values())
            .map(Enum::name)
            .collect(Collectors.toSet());

    /**
     * Verifies workspace update routing events exist and document events are internal-only.
     */
    @Test
    public void workspaceUpdateEvents_existAndDocumentEventsAreRemoved() {
        Assert.assertTrue(ALL_EVENT_NAMES.contains("WORKSPACE_PROJECT_KIND_TRANSITIONED"),
                "WORKSPACE_PROJECT_KIND_TRANSITIONED should exist");
        Assert.assertTrue(ALL_EVENT_NAMES.contains("WORKSPACE_PROJECT_UPDATED"),
                "WORKSPACE_PROJECT_UPDATED should exist");
        Assert.assertTrue(ALL_EVENT_NAMES.contains("WM_FILE_WATCHED_CHANGED"),
                "WM_FILE_WATCHED_CHANGED should exist");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("WM_DOCUMENT_OPENED"),
                "WM_DOCUMENT_OPENED should be removed");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("WM_DOCUMENT_CHANGED"),
                "WM_DOCUMENT_CHANGED should be removed");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("WM_DOCUMENT_CLOSED"),
                "WM_DOCUMENT_CLOSED should be removed");
    }

    /**
     * Verifies CE-E5 split into E5a and E5b resolution events (ADR-049).
     */
    @Test
    public void ceE5Events_splitIntoE5aAndE5b() {
        Assert.assertTrue(ALL_EVENT_NAMES.contains("CE_E5A_RESOLUTION_DIAGNOSTICS_READY"),
                "CE_E5A_RESOLUTION_DIAGNOSTICS_READY should exist");
        Assert.assertTrue(ALL_EVENT_NAMES.contains("CE_E5B_COMPILATION_DIAGNOSTICS_READY"),
                "CE_E5B_COMPILATION_DIAGNOSTICS_READY should exist");
    }

    /**
     * Verifies CE resolution exhausted and recovered events exist (ADR-049).
     */
    @Test
    public void ceResolutionEvents_exist() {
        Assert.assertTrue(ALL_EVENT_NAMES.contains("CE_RESOLUTION_EXHAUSTED"),
                "CE_RESOLUTION_EXHAUSTED should exist");
        Assert.assertTrue(ALL_EVENT_NAMES.contains("CE_RESOLUTION_RECOVERED"),
                "CE_RESOLUTION_RECOVERED should exist");
    }

    /**
     * Verifies RM-E1 heap pressure event exists (ADR-041).
     */
    @Test
    public void rmE1HeapPressureEvent_exists() {
        Assert.assertTrue(ALL_EVENT_NAMES.contains("RM_E1_HEAP_PRESSURE_DETECTED"),
                "RM_E1_HEAP_PRESSURE_DETECTED should exist");
    }

    /**
     * Verifies DS-E* events are removed (ADR-046).
     */
    @Test
    public void dsEvents_removed() {
        Assert.assertFalse(ALL_EVENT_NAMES.contains("DOCUMENT_OPENED"),
                "DOCUMENT_OPENED (DS-E1) should be removed");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("DOCUMENT_CHANGED"),
                "DOCUMENT_CHANGED (DS-E2) should be removed");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("DOCUMENT_CLOSED"),
                "DOCUMENT_CLOSED (DS-E3) should be removed");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("DOCUMENT_CONFIG_FILE_CHANGED"),
                "DOCUMENT_CONFIG_FILE_CHANGED (DS-E4) should be removed");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("DOCUMENT_FILE_WATCHER_EVENTS_PROCESSED"),
                "DOCUMENT_FILE_WATCHER_EVENTS_PROCESSED (DS-E5) should be removed");
        Assert.assertFalse(ALL_EVENT_NAMES.contains("DOCUMENT_SANDBOX_INVALIDATED"),
                "DOCUMENT_SANDBOX_INVALIDATED (DS-E6) should be removed");
    }

    /**
     * Verifies workspace change-routing events have correct event IDs.
     */
    @Test
    public void workspaceUpdateEvents_haveCorrectEventIds() {
        Assert.assertEquals(EventKind.WORKSPACE_PROJECT_KIND_TRANSITIONED.eventId(), "WM-E3");
        Assert.assertEquals(EventKind.WORKSPACE_PROJECT_UPDATED.eventId(), "WM-E4");
        Assert.assertEquals(EventKind.WM_FILE_WATCHED_CHANGED.eventId(), "WM-E11");
    }

    /**
     * Verifies CE E5a/E5b events have correct event IDs.
     */
    @Test
    public void ceE5Events_haveCorrectEventIds() {
        Assert.assertEquals(EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY.eventId(), "CE-E5a");
        Assert.assertEquals(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY.eventId(), "CE-E5b");
    }

    /**
     * Verifies CE resolution events have correct event IDs.
     */
    @Test
    public void ceResolutionEvents_haveCorrectEventIds() {
        Assert.assertEquals(EventKind.CE_RESOLUTION_EXHAUSTED.eventId(), "CE-E6");
        Assert.assertEquals(EventKind.CE_RESOLUTION_RECOVERED.eventId(), "CE-E7");
    }

    /**
     * Verifies RM-E1 event has correct event ID.
     */
    @Test
    public void rmE1Event_hasCorrectEventId() {
        Assert.assertEquals(EventKind.RM_E1_HEAP_PRESSURE_DETECTED.eventId(), "RM-E1");
    }

    /**
     * Verifies all event IDs are unique.
     */
    @Test
    public void allEventIds_areUnique() {
        Set<String> eventIds = Arrays.stream(EventKind.values())
                .map(EventKind::eventId)
                .collect(Collectors.toSet());
        Assert.assertEquals(eventIds.size(), EventKind.values().length,
                "All event IDs should be unique");
    }
}
