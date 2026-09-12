// The default module declares no model provider on purpose: the package's only provider lives in
// modules/ops. A durable agent declaration is always written into the default module
// (SourceBuilder resolves WORKFLOW_BAL against the project root), so a provider from modules/ops
// must not be adopted — a bare reference to it does not resolve here.
public function main() {
}
