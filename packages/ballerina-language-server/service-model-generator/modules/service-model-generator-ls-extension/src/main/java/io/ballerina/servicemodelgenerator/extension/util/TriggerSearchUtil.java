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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.trigger.LibraryMetadataReader;
import io.ballerina.modelgenerator.commons.trigger.models.ArtifactMetadata;
import io.ballerina.servicemodelgenerator.extension.model.TriggerBasicInfo;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Discovers event-integration trigger packages on Ballerina Central for the "Search more" flow.
 */
public final class TriggerSearchUtil {

    private static final Logger LOGGER = Logger.getLogger(TriggerSearchUtil.class.getName());

    private static final int DEFAULT_LIMIT = 30;
    private static final String EVENT_TYPE = "event";
    private static final String DEFAULT_QUERY = "trigger";
    private static final Set<String> TRIGGER_KEYWORDS = Set.of("trigger", "listener", "event");
    private static final String TRIGGER_TAG_KEYWORD = "type/trigger";
    private static final String TRIGGER_MODULE_PREFIX = "trigger.";
    private static final List<String> ALLOWED_ORGS = List.of("ballerina", "ballerinax");

    private static final ExecutorService CENTRAL_SEARCH_EXECUTOR = Executors.newFixedThreadPool(
            ALLOWED_ORGS.size(), runnable -> {
                Thread thread = new Thread(runnable, "trigger-central-search");
                thread.setDaemon(true);
                return thread;
            });

    private TriggerSearchUtil() {
    }

    /**
     * Searches Central for trigger packages matching {@code query}, restricted to
     * {@code ballerina}/{@code ballerinax}.
     *
     * <p>Takes no offset: the per-org fan-out below merges each org's own first page, so an offset
     * would apply per-org rather than to the merged result and paging would not compose. Add one only
     * once results are paged from a merged/global cursor rather than from each org's own Central query.
     */
    public static List<TriggerBasicInfo> searchCentral(CentralAPI central, String query, Integer limit,
                                                       Set<String> existingKeys) {
        try {
            String effectiveQuery = (query == null || query.isBlank()) ? DEFAULT_QUERY : query.trim();
            int effectiveLimit = limit == null || limit <= 0 ? DEFAULT_LIMIT : limit;

            List<CompletableFuture<List<TriggerBasicInfo>>> futures = ALLOWED_ORGS.stream()
                    .map(org -> CompletableFuture.supplyAsync(() -> {
                        Map<String, String> queryMap = new HashMap<>();
                        queryMap.put("q", effectiveQuery);
                        queryMap.put("org", org);
                        queryMap.put("limit", String.valueOf(effectiveLimit));
                        PackageResponse response = central.searchPackages(queryMap);
                        return toTriggerResults(response, existingKeys);
                    }, CENTRAL_SEARCH_EXECUTOR).exceptionally(e -> {
                        LOGGER.log(Level.FINE, "Central trigger search failed for org '" + org + "'", e);
                        return List.of();
                    }))
                    .toList();

            List<List<TriggerBasicInfo>> perOrgResults = futures.stream().map(CompletableFuture::join).toList();

            List<TriggerBasicInfo> results = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            int maxPerOrg = perOrgResults.stream().mapToInt(List::size).max().orElse(0);
            for (int i = 0; i < maxPerOrg && results.size() < effectiveLimit; i++) {
                for (List<TriggerBasicInfo> orgResults : perOrgResults) {
                    if (i >= orgResults.size() || results.size() >= effectiveLimit) {
                        continue;
                    }
                    TriggerBasicInfo info = orgResults.get(i);
                    if (seen.add(info.orgName() + "/" + info.packageName())) {
                        results.add(info);
                    }
                }
            }
            return results;
        } catch (Throwable e) {
            return List.of();
        }
    }

    /**
     * Searches the Ballerina local repository for packages shipping trigger metadata/schema files.
     */
    public static List<TriggerBasicInfo> searchLocalRepository(Set<String> existingKeys) {
        try {
            LibraryMetadataReader reader = LibraryMetadataReader.getInstance();
            Set<String> known = existingKeys == null ? Set.of() : existingKeys;
            List<TriggerBasicInfo> results = new ArrayList<>();
            for (ModuleInfo moduleInfo : reader.listLocalRepositoryModules()) {
                if (known.contains(key(moduleInfo.org(), moduleInfo.packageName()))) {
                    continue;
                }
                boolean hasTriggerFiles = reader.getTriggerMetadataModelFromLocalRepository(moduleInfo).isPresent()
                        || reader.getTriggerUIMetadataModelFromLocalRepository(moduleInfo).isPresent();
                if (!hasTriggerFiles) {
                    continue;
                }
                results.add(toLocalRepositoryTriggerBasicInfo(moduleInfo));
            }
            return results;
        } catch (Throwable e) {
            LOGGER.log(Level.FINE, "Local-repository trigger search failed", e);
            return List.of();
        }
    }

    private static TriggerBasicInfo toLocalRepositoryTriggerBasicInfo(ModuleInfo moduleInfo) {
        String protocol = ServiceModelUtils.getProtocol(moduleInfo.packageName());
        String icon = CommonUtils.generateIcon(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
        ArtifactMetadata metadata = LibraryMetadataReader.getInstance()
                .getArtifactMetadataFromLocalRepository(moduleInfo).orElse(null);
        String triggerKind = metadata == null || metadata.triggerKind() == null ? EVENT_TYPE : metadata.triggerKind();
        return new TriggerBasicInfo(
                0,
                moduleInfo.packageName(),
                moduleInfo.org(),
                moduleInfo.packageName(),
                moduleInfo.moduleName(),
                moduleInfo.version(),
                EVENT_TYPE,
                displayName(moduleInfo.packageName()),
                "",
                protocol,
                icon,
                triggerKind);
    }

    /**
     * Filters a Central package response to trigger packages and maps them to {@link TriggerBasicInfo}.
     */
    static List<TriggerBasicInfo> toTriggerResults(PackageResponse response, Set<String> existingKeys) {
        List<TriggerBasicInfo> results = new ArrayList<>();
        if (response == null || response.packages() == null) {
            return results;
        }
        Set<String> known = existingKeys == null ? Set.of() : existingKeys;
        for (PackageResponse.Package pkg : response.packages()) {
            if (pkg == null || pkg.isDeprecated()) {
                continue;
            }
            if (known.contains(key(pkg.organization(), pkg.name()))) {
                continue;
            }
            if (!isTriggerPackage(pkg.keywords(), pkg.name())) {
                continue;
            }
            results.add(toTriggerBasicInfo(pkg));
        }
        return results;
    }

    /**
     * Whether a Central package is an event-integration trigger.
     */
    static boolean isTriggerPackage(List<String> keywords, String name) {
        if (name != null && name.toLowerCase(Locale.US).startsWith(TRIGGER_MODULE_PREFIX)) {
            return true;
        }
        if (keywords == null) {
            return false;
        }
        return keywords.stream()
                .filter(Objects::nonNull)
                .map(k -> k.toLowerCase(Locale.US))
                .anyMatch(k -> TRIGGER_KEYWORDS.contains(k) || TRIGGER_TAG_KEYWORD.equals(k));
    }

    static TriggerBasicInfo toTriggerBasicInfo(PackageResponse.Package pkg) {
        String protocol = ServiceModelUtils.getProtocol(pkg.name());
        String icon = pkg.icon() == null ? "" : pkg.icon();
        return new TriggerBasicInfo(
                pkg.id(),
                pkg.name(),
                pkg.organization(),
                pkg.name(),
                pkg.name(),
                pkg.version(),
                EVENT_TYPE,
                displayName(pkg.name()),
                pkg.summary() == null ? "" : pkg.summary(),
                protocol,
                icon,
                EVENT_TYPE);
    }

    private static String key(String org, String name) {
        return org + "/" + name;
    }

    /**
     * Humanizes a Central package name for display (e.g. {@code trigger.github} -> {@code Github}).
     */
    static String displayName(String name) {
        if (name == null || name.isEmpty()) {
            return name;
        }
        String segment = name.substring(name.lastIndexOf('.') + 1);
        StringBuilder result = new StringBuilder();
        for (String word : segment.replace('_', ' ').replace('-', ' ').trim().split("\\s+")) {
            if (word.isEmpty()) {
                continue;
            }
            if (!result.isEmpty()) {
                result.append(' ');
            }
            result.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return result.isEmpty() ? segment : result.toString();
    }
}
