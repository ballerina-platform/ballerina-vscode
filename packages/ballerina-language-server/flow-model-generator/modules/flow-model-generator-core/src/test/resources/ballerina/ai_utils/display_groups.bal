@display {label: "Labels", groups: ["Bedrock", " Anthropic "]}
class Labels {
}

@display {label: "Records", groups: [{label: "Bedrock", description: "Models on Bedrock", iconPath: "https://icons/b.svg"}, "Meta"]}
class Records {
}

@display {label: "No groups"}
class NoGroups {
}

@display {label: "Empty record", groups: ["Bedrock", {}]}
class EmptyRecord {
}

@display {label: "Record without label", groups: ["Bedrock", {description: "x"}, "Anthropic"]}
class RecordWithoutLabel {
}

@display {label: "Nested list", groups: [["Bedrock"]]}
class NestedList {
}

@display {label: "Blank label", groups: ["Bedrock", "  "]}
class BlankLabel {
}
