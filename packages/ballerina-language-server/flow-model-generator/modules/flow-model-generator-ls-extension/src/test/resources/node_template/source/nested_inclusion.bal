function caller() {
    connect();
}

type BaseConfig record {|
    # Request pooling settings
    @display {label: "Pool Configuration"}
    int poolConfig?;
    # Payload validation
    @display {label: "Payload Validation"}
    boolean validation = true;
|};

type OuterConfig record {|
    *BaseConfig;
    # Token scope
    @display {label: "Token Scope"}
    string tokenScope?;
|};

function connect(*OuterConfig config) {
}
