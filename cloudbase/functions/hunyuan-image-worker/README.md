# Hunyuan Image Worker

This HTTP CloudBase function is deployed only to the growth-plan environment
`dev-d8g3hqv2b0de38046`. It generates images there, while the main Nordic Nutri
environment remains responsible for job state, downloading the temporary URL,
CloudBase Storage, and PostgreSQL.

## Required target-environment variables

- `TCB_ENV=dev-d8g3hqv2b0de38046`
- `AI_WORKER_SHARED_SECRET=<long random value>`
- `HY_IMAGE_MODEL=HY-Image-3.0-Plus-4090-Tob-v1.0`
- `HY_IMAGE_SIZE=1280x720`

The CloudBase function must use Node.js 18 and a 900 second timeout. Do not set
`CLOUDBASE_APIKEY`, permanent Tencent Cloud keys, database credentials, or any
Mini Program secret in this worker.

## Required main-environment variables

- `HY_IMAGE_WORKER_ENDPOINT=<worker HTTPS URL>/generate`
- `AI_WORKER_SHARED_SECRET=<the exact same long random value>`

The worker accepts only `POST /generate` requests with an HMAC-SHA256 signature
over the timestamp and raw JSON body. It rejects unsigned or older-than-five-
minute requests. The worker returns only the temporary generated image URL; the
main environment persists the final image.
