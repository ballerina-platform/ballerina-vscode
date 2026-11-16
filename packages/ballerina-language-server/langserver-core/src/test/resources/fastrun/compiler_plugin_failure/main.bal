import lstest/fastrun_marker as _;
import ballerina/jballerina.java;

function system_out() returns handle = @java:FieldGet {
    name: "out",
    'class: "java.lang.System"
} external;

function println(handle receiver, handle arg0) = @java:Method {
    name: "println",
    'class: "java.io.PrintStream",
    paramTypes: ["java.lang.String"]
} external;

public function main() {
    println(system_out(), java:fromString("__FAST_RUN_PLUGIN_FAILURE__"));
}
