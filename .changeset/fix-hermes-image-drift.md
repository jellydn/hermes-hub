---
"hermes-hub": patch
---

Recreate the Hermes container when a deploy moves the compose file to a new image, read the running image from the container, and fail Update or Rollback when the container does not run the target image.
