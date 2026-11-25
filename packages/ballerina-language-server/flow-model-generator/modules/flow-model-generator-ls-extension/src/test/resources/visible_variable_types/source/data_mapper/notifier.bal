client class Notifier {
    remote function notify(string message) returns string {
        string prefix = "note: ";

        return prefix + message;
    }
}
