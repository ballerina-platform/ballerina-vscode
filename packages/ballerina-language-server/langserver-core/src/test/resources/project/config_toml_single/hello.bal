import ballerina/jballerina.java;

configurable string greeting = "Hello from the default!";

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
    println(system_out(), java:fromString(greeting));
}
