import pkgB.helpers;

public function greetWithOptions(string name, *helpers:GreetingOptions options) returns string {
    return "Hello, " + name + "!";
}
