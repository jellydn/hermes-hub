---
"hermes-hub": patch
---

Address PR #26 review feedback:

- Fix race condition in remote inventory loading by adding a generation counter via useRef
- Add response shape validation in fetchRemoteSkills API client
- Apply defensive shell quoting to paths in buildManifestWriteCommand
- Align withSshConnection mock patterns in agent skills tests for consistency
