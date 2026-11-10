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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
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

    private static final int DESCRIPTION_LIMIT = 160;
    private static final Pattern PORT_IN_LISTENER =
            Pattern.compile("listener\\s+[\\w:]+\\s+\\w+\\s*=\\s*new\\s*\\(\\s*(?:listenOn\\s*=\\s*)?(\\d{2,5})");
    private static final Pattern PORT_IN_CONFIGURABLE =
            Pattern.compile("configurable\\s+int\\s+\\w+\\s*=\\s*(\\d{2,5})");
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
        String args = findAgentArguments(agentVar, sources);
        String role = args == null ? null : firstText(args, "role");
        String instructions = args == null ? null : firstText(args, "instructions");

        String base = role != null && !role.isBlank() ? role.trim() : humanize(agentVar);
        String name = base.toLowerCase(Locale.ROOT).endsWith("agent") ? base : base + " Agent";
        String lead = instructions != null && !instructions.isBlank() ? firstSentence(instructions)
                : "An agent that works as " + base + ".";

        return new Defaults(name, lead);
    }

    static String findAgentArguments(String agentVar, List<String> sources) {
        Pattern declaration = Pattern.compile(
                "\\bAgent\\s+" + Pattern.quote(agentVar) + "\\s*=\\s*(?:check\\s+)?new\\s*\\(");
        for (String source : sources) {
            Matcher m = declaration.matcher(source);
            if (m.find()) {
                return balanced(source, m.end() - 1);
            }
        }
        return null;
    }

    static String balanced(String text, int open) {
        int depth = 0;
        for (int i = open; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"') {
                i = skipTo(text, i, '"', true);
            } else if (c == '`') {
                i = skipTo(text, i, '`', false);
            } else if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
                if (depth == 0) {
                    return text.substring(open + 1, i);
                }
            }
        }
        return null;
    }

    private static int skipTo(String text, int from, char end, boolean escapes) {
        for (int i = from + 1; i < text.length(); i++) {
            char c = text.charAt(i);
            if (escapes && c == '\\') {
                i++;
            } else if (c == end) {
                return i;
            }
        }
        return text.length();
    }

    static String firstText(String args, String key) {
        Matcher m = Pattern.compile("\\b" + key + "\\s*:\\s*(?:string\\s*)?(?:\"((?:[^\"\\\\]|\\\\.)*)\"|`([^`]*)`)")
                .matcher(args);
        if (!m.find()) {
            return null;
        }
        return m.group(1) != null ? m.group(1) : m.group(2);
    }

    static int freePort(List<String> sources) {
        Set<Integer> used = new LinkedHashSet<>();
        for (String source : sources) {
            for (Pattern p : List.of(PORT_IN_LISTENER, PORT_IN_CONFIGURABLE)) {
                Matcher m = p.matcher(source);
                while (m.find()) {
                    used.add(Integer.parseInt(m.group(1)));
                }
            }
        }
        int port = FIRST_PORT;
        while (used.contains(port)) {
            port++;
        }
        return port;
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

    static String pascal(String identifier) {
        return humanize(identifier).replace(" ", "");
    }

    private static String firstSentence(String text) {
        String t = text.replaceAll("\\s+", " ").trim();
        int end = t.indexOf(". ");
        if (end > 0) {
            t = t.substring(0, end + 1);
        }
        return t.length() > DESCRIPTION_LIMIT ? t.substring(0, DESCRIPTION_LIMIT).trim() : t;
    }


    /**
     * Reads the skills a user wrote, one per line as {@code Name: description}. The id is the name in kebab case.
     * A line without a colon is a name alone, and its description is the name; blank lines are skipped.
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
            skills.add(new Skill(kebab(name), name, description.isEmpty() ? name : description,
                    List.of(), List.of()));
        }
        return skills;
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

        static final Extras NONE = new Extras("", "", "", "", "text", "", "text");

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
        if (!extras.providerOrganization().isBlank()) {
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
