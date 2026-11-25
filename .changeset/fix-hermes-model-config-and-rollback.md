---
"hermes-hub": patch
---

Set the Hermes model with `model.default` so `model.provider` stays in config.yaml, let Rollback return to the image the last update replaced (including digest refs), and stop Update Hermes from sending the rollback target.
