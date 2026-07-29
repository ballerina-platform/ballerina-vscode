public service class Example {
    private final string id;
    private final string name;

    function init(string name, string id) returns error? {
        self.name = name;
        self.id = id;
    }
}
