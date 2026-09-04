import ballerina/os;
import ballerina/time;

public function main() {
    _ = os:getEnv("HOME");
    _ = time:utcNow();
}
