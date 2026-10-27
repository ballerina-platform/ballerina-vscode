public client class OrderClient {
    private string baseUrl;

    public function init(string baseUrl) {
        self.baseUrl = baseUrl;
    }

    remote function send(string payload) returns string {
        return payload;
    }

    resource function get orders() returns string {
        return self.baseUrl;
    }

    function format(string payload) returns string {
        return payload;
    }
}
