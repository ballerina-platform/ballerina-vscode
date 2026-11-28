type Card record {|
    string id;
    int? age;
|};

function readCard(string raw) returns Card? {
    do {
        json data = check raw.fromJsonString();
        Card card = {id: "", age: ()};
        return card;
    } on fail {
        return ();
    }
}
