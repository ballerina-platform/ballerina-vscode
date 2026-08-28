public type Person record {|
    string name;
|};

public function greet(string name) returns string {
    return "Hello " + name;
}
