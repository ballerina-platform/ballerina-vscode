public type Config record {|
    string url;
|};

public function normalize(string value) returns string {
    return value.trim();
}
