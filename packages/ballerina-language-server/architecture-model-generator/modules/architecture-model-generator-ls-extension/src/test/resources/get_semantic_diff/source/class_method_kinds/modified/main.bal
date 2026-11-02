public client class OrderClient {
    private string baseUrl;

    public function init(string baseUrl) {
        self.baseUrl = baseUrl.trim();
    }

    remote function send(string payload) returns string {
        return self.validate(payload) ? payload : "";
    }

    resource function get orders() returns string {
        return self.baseUrl;
    }

    resource function get orders/[string id]() returns string {
        return self.baseUrl + "/" + id;
    }

    function validate(string payload) returns boolean {
        return payload.length() > 0;
    }
}
