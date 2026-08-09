import { describe, expect, it } from 'vitest';
import {
  EncryptedSecretVault,
  type SecretCipher,
  type SecretPersistence,
  type SecureSecretName,
} from './secure-vault';

function fixture(available = true) {
  const data = new Map<SecureSecretName, string>();
  const persistence: SecretPersistence = {
    read: (name) => data.get(name),
    write: (name, value) => data.set(name, value),
    remove: (name) => data.delete(name),
  };
  const cipher: SecretCipher = {
    available: () => available,
    encrypt: (value) => Buffer.from(`encrypted:${value}`).toString('base64'),
    decrypt: (value) =>
      Buffer.from(value, 'base64')
        .toString()
        .replace(/^encrypted:/, ''),
  };
  return { data, vault: new EncryptedSecretVault(persistence, cipher) };
}

describe('encrypted secret vault', () => {
  it('stores credentials encrypted and returns only status without reading them', () => {
    const { data, vault } = fixture();
    vault.set('openrouter-api-key', 'sk-or-secret');

    expect(vault.has('openrouter-api-key')).toBe(true);
    expect(data.get('openrouter-api-key')).not.toContain('sk-or-secret');
    expect(vault.get('openrouter-api-key')).toBe('sk-or-secret');
  });

  it('removes credentials', () => {
    const { vault } = fixture();
    vault.set('openrouter-api-key', 'sk-or-secret');
    vault.remove('openrouter-api-key');
    expect(vault.has('openrouter-api-key')).toBe(false);
  });

  it('refuses plaintext fallback when OS encryption is unavailable', () => {
    const { vault } = fixture(false);
    expect(() => vault.set('openrouter-api-key', 'sk-or-secret')).toThrow(/not available/);
  });
});
