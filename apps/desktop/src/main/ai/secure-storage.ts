import { safeStorage } from 'electron';
import Store from 'electron-store';
import {
  EncryptedSecretVault,
  type SecretCipher,
  type SecretPersistence,
  type SecureSecretName,
} from './secure-vault';

const store = new Store<{ secrets: Partial<Record<SecureSecretName, string>> }>({
  name: 'secure-credentials',
  defaults: { secrets: {} },
});

const persistence: SecretPersistence = {
  read: (name) => store.get(`secrets.${name}`),
  write: (name, value) => store.set(`secrets.${name}`, value),
  remove: (name) => store.delete(`secrets.${name}`),
};

const cipher: SecretCipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
  decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
};

export const secureSecrets = new EncryptedSecretVault(persistence, cipher);
