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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.modelgenerator.commons.SearchDatabaseManager.IndexedConnector;
import io.ballerina.modelgenerator.commons.SearchResult;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Groups connectors into browse categories using the keywords carried by the package index.
 *
 * <p>
 * Central runs two keyword schemes: the current {@code Area/Name} and the legacy {@code Area/Subarea}. Only about a
 * third of the indexed connectors carry the former, so both are read, in that precedence.
 * </p>
 *
 * @since 1.8.0
 */
public final class ConnectorCategoryResolver {

    public static final String OTHER_CATEGORY = "Other";
    public static final String POPULAR_CATEGORY = "Popular";
    private static final String CLIENT = "Client";
    private static final String AREA_PREFIX = "Area/";

    private ConnectorCategoryResolver() {
    }

    private static final List<String> CATEGORY_ORDER = List.of(
            POPULAR_CATEGORY, "Network", "Database", "Messaging", "AI & Machine Learning", "CRM & Sales",
            "Communication", "Productivity & Collaboration", "Storage & Files", "Media & Content",
            "Finance & Accounting", "ERP & Business Operations", "Human Resources", "Marketing & Social Media",
            "E-Commerce", "Website & Apps", "Cloud & DevOps", "Security & Identity", "Analytics", "Support",
            "IoT & Devices", "Education", "Lifestyle & News", OTHER_CATEGORY);

    /**
     * The curated first screen. Each entry also appears in its own category.
     */
    private static final List<String> POPULAR_ENTRIES = List.of(
            "http:Client", "salesforce:Client", "sap:Client", "snowflake:Client", "postgresql:Client",
            "mysql:Client", "mssql:Client", "kafka:Producer", "aws.s3:Client", "github:Client", "slack:Client",
            "googleapis.sheets:Client");

    /**
     * Leaders shown first within a category. Pull count alone ranks {@code java.jdbc} above {@code mysql}.
     */
    private static final Map<String, List<String>> PINS = Map.ofEntries(
            Map.entry("Network", List.of("http:Client", "graphql:Client", "websocket:Client",
                    "mcp:StreamableHttpClient", "ftp:Client", "tcp:Client", "udp:Client")),
            Map.entry("Database", List.of("mysql:Client", "postgresql:Client", "mongodb:Client", "redis:Client",
                    "mssql:Client", "oracledb:Client", "snowflake:Client")),
            Map.entry("Messaging", List.of("kafka:Consumer", "kafka:Producer", "rabbitmq:Client", "nats:Client",
                    "asb:MessageSender", "asb:MessageReceiver", "mqtt:Client")),
            Map.entry("AI & Machine Learning", List.of("openai.chat:Client", "azure.openai.chat:Client",
                    "mistral:Client", "openai.embeddings:Client", "pinecone.vector:Client", "weaviate:Client")),
            Map.entry("CRM & Sales", List.of("salesforce:Client", "hubspot.crm.obj.contacts:Client",
                    "hubspot.crm.obj.deals:Client", "pipedrive:Client")),
            Map.entry("Communication", List.of("twilio:Client", "googleapis.gmail:Client", "slack:Client",
                    "discord:Client")),
            Map.entry("Productivity & Collaboration", List.of("googleapis.sheets:Client",
                    "googleapis.calendar:Client", "microsoft.excel:Client", "asana:Client", "trello:Client")),
            Map.entry("Storage & Files", List.of("aws.s3:Client", "googleapis.drive:Client",
                    "microsoft.onedrive:Client", "dropbox:Client", "box:Client")),
            Map.entry("Media & Content", List.of("spotify:Client", "googleapis.youtube.data:Client",
                    "soundcloud:Client")),
            Map.entry("Finance & Accounting", List.of("stripe:Client", "paypal.orders:Client",
                    "xero.accounts:Client")),
            Map.entry("ERP & Business Operations", List.of("sap:Client", "sap.s4hana.api_sales_order_srv:Client")),
            Map.entry("Marketing & Social Media", List.of("twitter:Client", "mailchimp:Client", "sendgrid:Client")),
            Map.entry("E-Commerce", List.of("shopify.admin:Client")),
            Map.entry("Website & Apps", List.of("wordpress:Client")),
            Map.entry("Cloud & DevOps", List.of("github:Client", "gitlab:Client")),
            Map.entry("Security & Identity", List.of("azure.keyvault:Client", "aws.secretmanager:Client",
                    "ldap:Client")),
            Map.entry("Analytics", List.of("elasticsearch:Client")),
            Map.entry("Support", List.of("zendesk:Client", "servicenow:Client")),
            Map.entry("Human Resources", List.of("workday.common:Client")));

    private static final Map<String, String> AREA = Map.ofEntries(
            Map.entry("AI", "AI & Machine Learning"),
            Map.entry("AI & Machine Learning", "AI & Machine Learning"),
            Map.entry("Database", "Database"),
            Map.entry("Messaging", "Messaging"),
            Map.entry("CRM & Sales", "CRM & Sales"),
            Map.entry("Communication", "Communication"),
            Map.entry("Finance", "Finance & Accounting"),
            Map.entry("Finance & Accounting", "Finance & Accounting"),
            Map.entry("Accounts Receivable", "Finance & Accounting"),
            Map.entry("Accounts Payable", "Finance & Accounting"),
            Map.entry("Tax", "Finance & Accounting"),
            Map.entry("ERP & Business Operations", "ERP & Business Operations"),
            Map.entry("Marketing & Social Media", "Marketing & Social Media"),
            Map.entry("Storage & File Management", "Storage & Files"),
            Map.entry("Productivity", "Productivity & Collaboration"),
            Map.entry("Productivity & Collaboration", "Productivity & Collaboration"),
            Map.entry("Project Management", "Productivity & Collaboration"),
            Map.entry("E-Commerce", "E-Commerce"),
            Map.entry("Security & Identity", "Security & Identity"),
            Map.entry("Developer Tools", "Cloud & DevOps"),
            Map.entry("Cloud & Infrastructure", "Cloud & DevOps"),
            Map.entry("System", "Cloud & DevOps"),
            Map.entry("Human Resources", "Human Resources"),
            Map.entry("Healthcare", OTHER_CATEGORY),
            Map.entry("Compliance", OTHER_CATEGORY));

    /**
     * The subarea is load-bearing: {@code IT Operations/Databases} and {@code IT Operations/Source Control} are
     * unrelated, so the full key is matched before falling back to the area prefix.
     */
    private static final Map<String, String> LEGACY = Map.ofEntries(
            Map.entry("IT Operations/Databases", "Database"),
            Map.entry("IT Operations/Message Brokers", "Messaging"),
            Map.entry("IT Operations/Cloud Services", "Cloud & DevOps"),
            Map.entry("IT Operations/Source Control", "Cloud & DevOps"),
            Map.entry("IT Operations/Server Monitoring", "Cloud & DevOps"),
            Map.entry("IT Operations/Gateway", "Cloud & DevOps"),
            Map.entry("IT Operations/Testing Tools", "Cloud & DevOps"),
            Map.entry("IT Operations/Debug Tools", "Cloud & DevOps"),
            Map.entry("IT Operations/Browser Tools", "Cloud & DevOps"),
            Map.entry("IT Operations/Data Ingestion", "Cloud & DevOps"),
            Map.entry("IT Operations/Enterprise Architecture Tools", "Cloud & DevOps"),
            Map.entry("IT Operations/Authentication", "Security & Identity"),
            Map.entry("IT Operations/Security & Identity Tools", "Security & Identity"),
            Map.entry("IT Operations/Geographic Information Systems", OTHER_CATEGORY),
            Map.entry("Security/Authentication", "Security & Identity"),
            Map.entry("Content & Files/Documents", "Storage & Files"),
            Map.entry("Content & Files/File Management & Storage", "Storage & Files"),
            Map.entry("Content & Files/Notes", "Storage & Files"),
            Map.entry("Content & Files/Video & Audio", "Media & Content"),
            Map.entry("Content & Files/Images & Design", "Media & Content"),
            Map.entry("Content & Files/Blogs", "Media & Content"),
            Map.entry("Website & App Building/App Builders", "Website & Apps"),
            Map.entry("Website & App Building/Website Builders", "Website & Apps"),
            Map.entry("Website & App Building/Web Scraper", "Website & Apps"),
            Map.entry("Website & App Building/Search Engine Optimization", "Website & Apps"),
            Map.entry("Support/Customer Support", "Support"),
            Map.entry("Support//Customer Support", "Support"),
            Map.entry("Internet of Things/Device Management", "IoT & Devices"),
            Map.entry("Education/Student Services", "Education"),
            Map.entry("Education/Elearning", "Education"),
            Map.entry("Education/eLearning", "Education"),
            Map.entry("Education/Translator", "Education"),
            Map.entry("Education/Dictionary", "Education"),
            Map.entry("Lifestyle & Entertainment/News & Lifestyle", "Lifestyle & News"),
            Map.entry("Lifestyle & Entertainment/Books", "Lifestyle & News"),
            Map.entry("Lifestyle & Entertainment/Ride-Hailing", "Lifestyle & News"),
            Map.entry("Lifestyle & Entertainment/App Store", "Lifestyle & News"),
            Map.entry("Sales & CRM", "CRM & Sales"),
            Map.entry("Commerce", "E-Commerce"),
            Map.entry("Business Intelligence", "Analytics"),
            Map.entry("Business Management", "ERP & Business Operations"),
            Map.entry("Human Resources", "Human Resources"),
            Map.entry("Marketing", "Marketing & Social Media"),
            Map.entry("Communication", "Communication"),
            Map.entry("Communication chat", "Communication"),
            Map.entry("Productivity", "Productivity & Collaboration"),
            Map.entry("Finance", "Finance & Accounting"),
            Map.entry("AI", "AI & Machine Learning"),
            Map.entry("vendor", OTHER_CATEGORY));

    private static final Set<String> RESERVED_PREFIXES = Set.of("Cost/", "Vendor/", "Type/", "Area/", "Name/");

    /**
     * Protocol clients from the standard library, which carry no categorising keyword.
     */
    private static final Map<String, String> STDLIB = Map.ofEntries(
            Map.entry("http", "Network"),
            Map.entry("graphql", "Network"),
            Map.entry("websocket", "Network"),
            Map.entry("tcp", "Network"),
            Map.entry("udp", "Network"),
            Map.entry("ftp", "Network"),
            Map.entry("websub", "Network"),
            Map.entry("websubhub", "Network"),
            Map.entry("grpc", "Network"),
            Map.entry("mcp", "Network"),
            Map.entry("soap", "Network"),
            Map.entry("soap.soap11", "Network"),
            Map.entry("soap.soap12", "Network"),
            Map.entry("email", "Communication"),
            Map.entry("messaging", "Messaging"));

    /**
     * Modules whose keywords place them badly or not at all.
     */
    private static final Map<String, String> MANUAL = Map.ofEntries(
            Map.entry("docusign.dsadmin", "Storage & Files"),
            Map.entry("smb", "Storage & Files"),
            Map.entry("boxapi", "Storage & Files"),
            Map.entry("ldap", "Security & Identity"),
            Map.entry("mqtt", "Messaging"),
            Map.entry("aws.dynamodbstreams", "Database"),
            Map.entry("aws.redshiftdata", "Database"),
            Map.entry("dayforce", "Human Resources"),
            Map.entry("ibm.ctg", "ERP & Business Operations"),
            Map.entry("bitly", "Marketing & Social Media"),
            Map.entry("sugarcrm", "CRM & Sales"),
            Map.entry("interzoid.currencyexchange", "Finance & Accounting"),
            Map.entry("asb.admin", "Messaging"),
            Map.entry("solace", "Messaging"),
            Map.entry("solace.semp", "Messaging"),
            Map.entry("hubspot.automation.actions", "CRM & Sales"),
            Map.entry("hubspot.crm.engagement.meeting", "CRM & Sales"));

    /**
     * Classes that are not a connector in their own right: protocol plumbing, provider shims, and sub-handles.
     */
    private static final List<String> DENY_SUFFIXES =
            List.of("Caller", "Handler", "Model", "Provider", "Store", "Service");
    private static final Set<String> DENY_EXACT = Set.of(
            "Agent", "FunctionCallAgent", "ReActAgent", "ChatClient", "Context", "Connection", "Session",
            "Collection", "Database", "FailoverClient", "LoadBalanceClient", "StatusCodeClient", "StreamingClient",
            "ConnectClient", "DiscoveryService", "SubscriptionClient", "HubClient", "PublisherClient");

    private static final Set<String> ALLOW_EXTRA = Set.of(
            "Consumer", "Producer", "StreamableHttpClient", "ImapClient", "PopClient", "SmtpClient",
            "DataPlaneClient", "ManagementClient", "AdvancedClient", "JetStreamClient", "MessageReceiver",
            "MessageSender", "Administrator", "Queue", "Topic", "MessageConsumer", "MessageProducer", "Publisher");

    private static final Set<String> EXCLUDED_MODULES = Set.of("ai.agent");
    private static final List<String> EXCLUDED_MODULE_PREFIXES = List.of("health.", "healthcare.", "ai.");
    private static final List<String> EXCLUDED_MODULE_SUBSTRINGS = List.of("fhir", "hl7", "ccda", ".driver");

    /**
     * A package is dropped only when every {@code Type/} keyword it carries is one of these, since real connectors
     * also carry {@code Type/Trigger}.
     */
    private static final Set<String> EXCLUDED_TYPE_KEYWORDS = Set.of(
            "Type/Driver", "Type/Library", "Type/Model Provider", "Type/Embedding Provider", "Type/Trigger");

    /**
     * Resolves the browse category for a connector.
     *
     * @param moduleName the module name, e.g. {@code googleapis.gmail}
     * @param keywords   the package keywords as carried by the index
     * @return the category name, or {@value #OTHER_CATEGORY} when no rule matches
     * @since 1.8.0
     */
    public static String categorize(String moduleName, List<String> keywords) {
        String manual = MANUAL.get(moduleName);
        if (manual != null) {
            return manual;
        }
        String stdlib = STDLIB.get(moduleName);
        if (stdlib != null) {
            return stdlib;
        }
        if (keywords == null) {
            return OTHER_CATEGORY;
        }
        for (String keyword : keywords) {
            if (keyword.startsWith(AREA_PREFIX)) {
                String category = AREA.get(keyword.substring(AREA_PREFIX.length()));
                if (category != null) {
                    return category;
                }
            }
        }
        for (String keyword : keywords) {
            if (keyword.indexOf('/') < 0 || isReserved(keyword)) {
                continue;
            }
            String category = LEGACY.get(keyword);
            if (category != null) {
                return category;
            }
            category = LEGACY.get(keyword.substring(0, keyword.indexOf('/')));
            if (category != null) {
                return category;
            }
        }
        return OTHER_CATEGORY;
    }

    private static boolean isReserved(String keyword) {
        return RESERVED_PREFIXES.stream().anyMatch(keyword::startsWith);
    }

    /**
     * Whether the module and client class pair should appear in the connector catalogue.
     *
     * @param moduleName the module name
     * @param className  the client class name
     * @param keywords   the package keywords as carried by the index
     * @return true if the pair is a browsable connector
     * @since 1.8.0
     */
    public static boolean isCatalogueConnector(String moduleName, String className, List<String> keywords) {
        if (moduleName == null || className == null) {
            return false;
        }
        String module = moduleName.toLowerCase(Locale.ROOT);
        if (EXCLUDED_MODULES.contains(module)
                || EXCLUDED_MODULE_PREFIXES.stream().anyMatch(module::startsWith)
                || EXCLUDED_MODULE_SUBSTRINGS.stream().anyMatch(module::contains)) {
            return false;
        }
        if (keywords != null) {
            List<String> types = keywords.stream().filter(k -> k.startsWith("Type/")).toList();
            if (!types.isEmpty() && EXCLUDED_TYPE_KEYWORDS.containsAll(types)) {
                return false;
            }
        }
        if (DENY_EXACT.contains(className) || DENY_SUFFIXES.stream().anyMatch(className::endsWith)) {
            return false;
        }
        return CLIENT.equals(className) || ALLOW_EXTRA.contains(className);
    }

    public static String key(String moduleName, String className) {
        return moduleName + ":" + className;
    }

    /**
     * Groups indexed connectors into the categories the connector browser renders.
     *
     * @param connectors every connector the index holds for the allowed organizations
     * @return the populated categories in display order, each ranked pinned-first then by pull count
     * @since 1.8.0
     */
    public static Map<String, List<SearchResult>> group(List<IndexedConnector> connectors) {
        Map<String, IndexedConnector> byKey = new HashMap<>();
        for (IndexedConnector connector : connectors) {
            String moduleName = moduleOf(connector);
            String connectorName = connector.searchResult().name();
            if (!isCatalogueConnector(moduleName, connectorName, connector.keywords())) {
                continue;
            }
            // A module can be indexed more than once; keep the most pulled row.
            byKey.merge(key(moduleName, connectorName), connector,
                    (existing, candidate) -> candidate.pullCount() > existing.pullCount() ? candidate : existing);
        }

        Map<String, List<CatalogueEntry>> byCategory = new HashMap<>();
        byKey.forEach((entryKey, connector) -> byCategory
                .computeIfAbsent(categorize(moduleOf(connector), connector.keywords()), c -> new ArrayList<>())
                .add(new CatalogueEntry(entryKey, connector)));

        Map<String, List<SearchResult>> catalogue = new LinkedHashMap<>();
        for (String category : CATEGORY_ORDER) {
            List<SearchResult> results = POPULAR_CATEGORY.equals(category)
                    ? curated(byKey)
                    : rank(byCategory.getOrDefault(category, List.of()), category);
            if (!results.isEmpty()) {
                catalogue.put(category, results);
            }
        }
        return catalogue;
    }

    private static List<SearchResult> curated(Map<String, IndexedConnector> byKey) {
        List<SearchResult> results = new ArrayList<>();
        for (String entry : POPULAR_ENTRIES) {
            IndexedConnector connector = byKey.get(entry);
            if (connector != null) {
                results.add(connector.searchResult());
            }
        }
        return results;
    }

    /**
     * Pinned leaders first, then pull count. Pull count alone ranks {@code java.jdbc} above {@code mysql}.
     */
    private static List<SearchResult> rank(List<CatalogueEntry> entries, String category) {
        List<String> pins = pinnedEntries(category);
        Map<String, Integer> pinOrder = new HashMap<>(pins.size());
        for (int i = 0; i < pins.size(); i++) {
            pinOrder.put(pins.get(i), i);
        }
        return entries.stream()
                .sorted(Comparator
                        .comparingInt((CatalogueEntry entry) -> pinOrder.getOrDefault(entry.key(), pins.size()))
                        .thenComparing(Comparator.comparingInt(
                                (CatalogueEntry entry) -> entry.connector().pullCount()).reversed())
                        .thenComparing(CatalogueEntry::key))
                .map(entry -> entry.connector().searchResult())
                .toList();
    }

    private static String moduleOf(IndexedConnector connector) {
        return connector.searchResult().packageInfo().moduleName();
    }

    private record CatalogueEntry(String key, IndexedConnector connector) {
    }

    public static List<String> categoryOrder() {
        return CATEGORY_ORDER;
    }

    public static List<String> popularEntries() {
        return POPULAR_ENTRIES;
    }

    public static List<String> pinnedEntries(String category) {
        return PINS.getOrDefault(category, List.of());
    }
}
