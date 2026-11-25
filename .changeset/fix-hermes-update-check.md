---
"hermes-hub": patch
---

Read the running Hermes image correctly (RepoDigests comes from the image, not the container), offer Update when the running release is older or its digest is unknown, and remove stopped leftover `<id>_hermes` containers that block a recreate, with a clear error when one is still running.
