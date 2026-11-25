class Labels {
    private map<string> entries = {};

    function init(string owner) {
    }

    function set(string key, string value) {
        self.entries[key] = value;
    }

    private function clear() {
        self.entries = {};
    }
}

function tag(Labels labels) {
}

function run() {
    int count = 1;
}

type Span [int, decimal];

function pause(Span span) {
}
