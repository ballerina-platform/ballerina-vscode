# Trigger UI metadata authoring (v1.0)

Trigger UI metadata is a sparse overlay over the L1 connector model. Write only
choices or presentation that introspection cannot derive. Collections whose order
is visible in the UI are arrays; named record fields are maps.

```json
{
  "version": "v1.0",
  "listeners": [{
    "target": "$listener",
    "form": { "section": { "label": "Configure listener" } },
    "formFields": {
      "host": {
        "metadata": { "label": "Host" },
        "source": { "argType": "LISTENER_PARAM_REQUIRED", "position": 1 }
      }
    }
  }],
  "initForm": { "fields": [{
    "target": { "kind": "recordField", "owner": "message.parameter", "path": "type" },
    "metadata": { "label": "Payload type" },
        "source": {
          "construct": { "kind": "FUNCTION_PARAM" },
          "argument": { "originalName": "content" },
          "module": { "name": "ftp" }
        }
  }] }
}
```

Targets are either an L1 reference string (`"$service.onMessage"`) or a
semantic object. A source is flat; there is no `source.codedata`. A field map's
key is its field key and must not be repeated in the value. A derived widget is
omitted, one authored widget is a direct `widget` object, and alternatives use
`widget.alternatives` plus an optional `selectedIndex`.

Connector-specific additions belong under `extensions` and must use a
namespaced key such as `acme:payloadMode`. Unknown ordinary keys are errors in
authoring tooling; extensions are accepted only when a matching compiler
extension is registered.
