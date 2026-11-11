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

package io.ballerina.servicemodelgenerator.extension.builder.service.agent;

import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Derives the default Agent Card of an agent from the project source and renders it as the constant record literal
 * that {@code @a2a:ServiceConfig} requires.
 *
 * @since 1.9.0
 */
final class A2aAgentCard {

    static final int FIRST_PORT = 9096;
    static final String DEFAULT_VERSION = "1.0.0";

    private static final Pattern CONFIG_PORT =
            Pattern.compile("(?im)^\\s*[\\w.\"-]*port[\\w\"-]*\\s*=\\s*(\\d{2,5})\\s*$");
    private static final Pattern STRING_TEMPLATE = Pattern.compile("^string\\s*`(.*)`$", Pattern.DOTALL);
    private static final Pattern RAW_TEMPLATE = Pattern.compile("^`(.*)`$", Pattern.DOTALL);
    private static final Pattern STRING_LITERAL = Pattern.compile("^\"(.*)\"$", Pattern.DOTALL);

    record Skill(String id, String name, String description, List<String> tags, List<String> examples) {
    }

    record Defaults(String name, String description) {
    }

    private A2aAgentCard() {
    }

    static List<String> sourcesOf(Project project) {
        List<String> sources = new ArrayList<>();
        if (project == null) {
            return sources;
        }
        for (Module module : project.currentPackage().modules()) {
            for (DocumentId id : module.documentIds()) {
                sources.add(module.document(id).textDocument().toString());
            }
        }
        return sources;
    }

    static Defaults derive(String agentVar, List<String> sources) {
        return derive(agentVar, ProjectDeclarations.parse(sources));
    }

    static Defaults derive(String agentVar, ProjectDeclarations declarations) {
        String base = declarations.roleOf(agentVar).map(String::strip).orElseGet(() -> humanize(agentVar));
        String name = base.toLowerCase(Locale.ROOT).endsWith("agent") ? base : base + " Agent";
        // The card is public, so its default text comes from the role, never from the instructions.
        return new Defaults(name, "An agent that works as " + base + ".");
    }

    static int freePort(List<String> sources) {
        return freePort(ProjectDeclarations.parse(sources).usedPorts());
    }

    static int freePort(Set<Integer> used) {
        int port = FIRST_PORT;
        while (used.contains(port)) {
            port++;
        }
        return port;
    }

    /**
     * The ports set in the project's Config.toml, under any key whose name contains "port". A listener whose port is
     * a configurable listens on the value there, not on the default in the source.
     *
     * @param project the project
     * @return the ports found, empty when there is no Config.toml
     */
    static Set<Integer> configPorts(Project project) {
        if (project == null) {
            return Set.of();
        }
        Path config = project.sourceRoot().resolve("Config.toml");
        try {
            return Files.isRegularFile(config) ? configPorts(Files.readString(config)) : Set.of();
        } catch (IOException | RuntimeException e) {
            return Set.of();
        }
    }

    static Set<Integer> configPorts(String toml) {
        Set<Integer> ports = new HashSet<>();
        Matcher m = CONFIG_PORT.matcher(toml);
        while (m.find()) {
            ports.add(Integer.parseInt(m.group(1)));
        }
        return ports;
    }

    static String humanize(String identifier) {
        String spaced = identifier.replaceAll("([a-z0-9])([A-Z])", "$1 $2").replaceAll("[_\\-]+", " ").trim();
        StringBuilder out = new StringBuilder();
        for (String word : spaced.split("\\s+")) {
            if (word.isEmpty()) {
                continue;
            }
            out.append(out.length() == 0 ? "" : " ")
                    .append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return out.toString();
    }

    static String kebab(String text) {
        String k = text.replaceAll("([a-z0-9])([A-Z])", "$1-$2").toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        return k.isEmpty() ? "skill" : k;
    }

    /**
     * The identifier with its first letter in upper case, for naming a class after it. Unlike a humanized name, two
     * identifiers that differ only in case or underscores stay different.
     *
     * @param identifier the agent variable
     * @return the identifier as the start of a class name
     */
    static String classBase(String identifier) {
        if (identifier.isEmpty()) {
            return identifier;
        }
        return Character.toUpperCase(identifier.charAt(0)) + identifier.substring(1);
    }


    /**
     * Reads the skills a user wrote, one per line as {@code Name: description}. The id is the name in kebab case,
     * with a numeric suffix when an earlier skill has the same id. A line without a colon is a name alone, and its
     * description is the name; blank lines are skipped.
     *
     * @param lines the entries of the Skills field
     * @return the skills, in the order written
     */
    static List<Skill> skillsFromLines(List<String> lines) {
        List<Skill> skills = new ArrayList<>();
        for (String line : lines) {
            String entry = line == null ? "" : plainText(line);
            if (entry.isEmpty()) {
                continue;
            }
            int colon = entry.indexOf(':');
            String name = (colon < 0 ? entry : entry.substring(0, colon)).strip();
            String description = colon < 0 ? "" : entry.substring(colon + 1).strip();
            if (name.isEmpty()) {
                continue;
            }
            skills.add(new Skill(uniqueId(kebab(name), skills), name, description.isEmpty() ? name : description,
                    List.of(), List.of()));
        }
        return skills;
    }

    /** The id, with a numeric suffix when an earlier skill already has it. */
    private static String uniqueId(String id, List<Skill> earlier) {
        Set<String> taken = new HashSet<>();
        earlier.forEach(skill -> taken.add(skill.id()));
        String unique = id;
        for (int n = 2; taken.contains(unique); n++) {
            unique = id + "-" + n;
        }
        return unique;
    }

    /**
     * The text the user typed. The form keeps each entry of a list as a Ballerina expression: a string template, as
     * {@code string `text`}, a raw template or a quoted string. A bare entry is taken as it is.
     */
    static String plainText(String entry) {
        String text = entry.strip();
        Matcher template = STRING_TEMPLATE.matcher(text);
        if (template.matches()) {
            return template.group(1).replace("${\"${\"}", "${").replace("${\"`\"}", "`").strip();
        }
        Matcher raw = RAW_TEMPLATE.matcher(text);
        if (raw.matches()) {
            return raw.group(1).strip();
        }
        Matcher literal = STRING_LITERAL.matcher(text);
        if (literal.matches()) {
            return literal.group(1).replace("\\\"", "\"").replace("\\\\", "\\").strip();
        }
        return text;
    }

    static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            switch (c) {
                case '\\' -> out.append("\\\\");
                case '"' -> out.append("\\\"");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> out.append(c);
            }
        }
        return out.append('"').toString();
    }

    private static String stringList(List<String> values) {
        List<String> quoted = new ArrayList<>();
        values.forEach(v -> quoted.add(quote(v)));
        return "[" + String.join(", ", quoted) + "]";
    }

    record Extras(String providerOrganization, String providerUrl, String documentationUrl, String iconUrl,
                  String inputModes, String providerEmail, String outputModes) {

        Extras {
            providerOrganization = providerOrganization == null ? "" : providerOrganization.strip();
            providerUrl = providerUrl == null ? "" : providerUrl.strip();
            documentationUrl = documentationUrl == null ? "" : documentationUrl.strip();
            iconUrl = iconUrl == null ? "" : iconUrl.strip();
            inputModes = inputModes == null || inputModes.isBlank() ? "text" : inputModes.strip();
            providerEmail = providerEmail == null ? "" : providerEmail.strip();
            outputModes = outputModes == null || outputModes.isBlank() ? "text" : outputModes.strip();
        }

        List<String> inputModeList() {
            return Arrays.stream(inputModes.split(",")).map(String::strip).filter(m -> !m.isEmpty()).toList();
        }

        List<String> outputModeList() {
            return Arrays.stream(outputModes.split(",")).map(String::strip).filter(m -> !m.isEmpty()).toList();
        }
    }

    static String cardLiteral(String name, String description, String version, List<Skill> skills, Extras extras,
                              String indent) {
        String in = indent + "    ";
        StringBuilder s = new StringBuilder("{\n");
        s.append(in).append("name: ").append(quote(name)).append(",\n");
        s.append(in).append("description: ").append(quote(description)).append(",\n");
        s.append(in).append("version: ").append(quote(version)).append(",\n");
        // a2a:AgentProvider needs both the organization and its URL; A2aChannel refuses a half-filled provider.
        if (!extras.providerOrganization().isBlank() && !extras.providerUrl().isBlank()) {
            s.append(in).append("provider: {organization: ").append(quote(extras.providerOrganization()))
                    .append(", url: ").append(quote(extras.providerUrl()))
                    .append(extras.providerEmail().isBlank() ? ""
                            : ", contactEmail: " + quote(extras.providerEmail()))
                    .append("},\n");
        }
        if (!extras.documentationUrl().isBlank()) {
            s.append(in).append("documentationUrl: ").append(quote(extras.documentationUrl())).append(",\n");
        }
        if (!extras.iconUrl().isBlank()) {
            s.append(in).append("iconUrl: ").append(quote(extras.iconUrl())).append(",\n");
        }
        s.append(in).append("skills: [");
        for (int i = 0; i < skills.size(); i++) {
            Skill k = skills.get(i);
            s.append(i == 0 ? "\n" : ",\n").append(in).append("    {\n");
            s.append(in).append("        id: ").append(quote(k.id())).append(",\n");
            s.append(in).append("        name: ").append(quote(k.name())).append(",\n");
            s.append(in).append("        description: ").append(quote(k.description())).append(",\n");
            s.append(in).append("        tags: ").append(stringList(k.tags()));
            if (!k.examples().isEmpty()) {
                s.append(",\n").append(in).append("        examples: ").append(stringList(k.examples()));
            }
            s.append("\n").append(in).append("    }");
        }
        s.append(skills.isEmpty() ? "" : "\n" + in).append("],\n");
        s.append(in).append("defaultInputModes: ").append(stringList(extras.inputModeList())).append(",\n");
        s.append(in).append("defaultOutputModes: ").append(stringList(extras.outputModeList())).append(",\n");
        s.append(in).append("capabilities: {},\n");
        s.append(in).append("supportedInterfaces: []\n");
        s.append(indent).append("}");
        return s.toString();
    }
}
