type Config record {|
    string foo_bar?;
    string fooBar?;
    string? password = ();
    int|string size?;
    float timeout?;
    decimal rate?;
|};

type Pool record {|
    string? password = ();
|};

type Auth record {|
    string token;
|};

type Client record {|
    Auth auth;
    string url?;
    int retries?;
|};

// A parameter given as a union of a string and a record, whose field is a union of a record and its list
// (as a MongoDB client's connection is).
type ServerAddress record {|
    string host = "localhost";
    int port = 27017;
|};

type ConnectionParameters record {|
    ServerAddress|ServerAddress[] serverAddress = {};
    Auth auth?;
|};

type Connection string|ConnectionParameters;

configurable string sharedUrl = ?;
configurable int sharedSize = ?;
