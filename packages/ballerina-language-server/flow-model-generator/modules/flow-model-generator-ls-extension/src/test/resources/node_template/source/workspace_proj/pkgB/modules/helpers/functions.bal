public enum GreetingStyle {
    FRIENDLY = "friendly",
    FORMAL = "formal"
}

public function submoduleGreeting(string name = "World", GreetingStyle style = FRIENDLY) returns string {
    return "Hello from the submodule, " + name + "!";
}
