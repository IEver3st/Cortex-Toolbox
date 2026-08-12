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
  it('stores WorkOS state encrypted and returns it only through the main-process vault', () => {
    const { data, vault } = fixture();
    vault.set('workos-session', 'session-secret');

    expect(vault.has('workos-session')).toBe(true);
    expect(data.get('workos-session')).not.toContain('session-secret');
    expect(vault.get('workos-session')).toBe('session-secret');
  });

  it('removes credentials', () => {
    const { vault } = fixture();
    vault.set('workos-pkce', 'pkce-secret');
    vault.remove('workos-pkce');
    expect(vault.has('workos-pkce')).toBe(false);
  });

  it('refuses plaintext fallback when OS encryption is unavailable', () => {
    const { vault } = fixture(false);
    expect(() => vault.set('workos-session', 'session-secret')).toThrow(/not available/);
  });
});
