type Credentials record {|
    string username;
    string password;
|};

type Token record {|
    string token;
|};

configurable boolean isAdmin = ?;
configurable string url = ?;
configurable Credentials|Token authConfig = ?;
configurable string foo = "cats";

public function main() {
}
