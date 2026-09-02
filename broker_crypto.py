"""
broker_crypto.py - Cloud KMS-backed encryption for the SnapTrade user secret.

The secret is tiny (well under Cloud KMS's 64 KiB direct-encrypt limit), so this
uses direct symmetric encrypt/decrypt rather than envelope encryption - no local
data-encryption-key handling needed. The key material never leaves KMS; only
ciphertext is ever stored (in Firestore, alongside the rest of the user's data).

Requires the BROKER_KMS_KEY_NAME env var, e.g.:
  projects/investogram-d995a/locations/us-central1/keyRings/broker-sync/cryptoKeys/snaptrade-user-secret
"""

import base64
import os

_kms_client = None


def _get_client():
    global _kms_client
    if _kms_client is None:
        from google.cloud import kms
        _kms_client = kms.KeyManagementServiceClient()
    return _kms_client


def _key_name():
    key_name = os.environ.get('BROKER_KMS_KEY_NAME')
    if not key_name:
        raise RuntimeError('BROKER_KMS_KEY_NAME is not configured')
    return key_name


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a small string via Cloud KMS, return base64 ciphertext."""
    client = _get_client()
    response = client.encrypt(request={'name': _key_name(), 'plaintext': plaintext.encode('utf-8')})
    return base64.b64encode(response.ciphertext).decode('ascii')


def decrypt_secret(ciphertext_b64: str) -> str:
    """Decrypt a base64 ciphertext produced by encrypt_secret back to the plaintext string."""
    client = _get_client()
    ciphertext = base64.b64decode(ciphertext_b64)
    response = client.decrypt(request={'name': _key_name(), 'ciphertext': ciphertext})
    return response.plaintext.decode('utf-8')
