class Inbound {
    public function attach(service object {} s, string[]|string? name = ()) returns error? {}
    public function detach(service object {} s) returns error? {}
    public function 'start() returns error? {}
    public function gracefulStop() returns error? {}
    public function immediateStop() returns error? {}
}

configurable string apiUrl = "https://example.com";
final string region = "eu";
string counter = "";
listener Inbound inbound = new;

function handle(string payload) {
    string reply = "";
    final string fixed = "";
    
}
