#!/bin/bash
# Broker Sync credentials — copy to broker-secrets.sh and fill in real values.
# broker-secrets.sh is gitignored; never commit real credentials.

export SNAPTRADE_CLIENT_ID="your-snaptrade-client-id"
export SNAPTRADE_CONSUMER_KEY="your-snaptrade-consumer-key"

# Cloud KMS resource name of the symmetric key used to encrypt each user's
# SnapTrade userSecret at rest (see broker_crypto.py). Create it once with:
#   gcloud kms keyrings create broker-sync --location us-central1
#   gcloud kms keys create snaptrade-user-secret --location us-central1 \
#       --keyring broker-sync --purpose encryption
export BROKER_KMS_KEY_NAME="projects/investogram-d995a/locations/us-central1/keyRings/broker-sync/cryptoKeys/snaptrade-user-secret"
