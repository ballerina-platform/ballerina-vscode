# A local client used to exercise the connector action signature analysis.
public client class LocalClient {

    # Adds an entry.
    #
    # + name - The entry name
    # + count - The entry count
    # + return - The created entry
    remote function addEntry(string name, int count = 1) returns json|error {
        return {name: name, count: count};
    }

    # Sends a message.
    #
    # + message - The message payload
    # + return - The delivery status
    remote function send(LocalClient|string|xml message) returns string|error {
        return "sent";
    }

    remote function dispatch(LocalClient input) returns json|error {
        return {};
    }

    remote function combine(string... parts) returns json {
        return {};
    }

    remote function fetchLines() returns stream<string>|error {
        string[] lines = ["a", "b"];
        return lines.toStream();
    }
}

final LocalClient localClient = new;

public function main() {
}
