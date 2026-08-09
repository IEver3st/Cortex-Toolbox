export type SecureSecretName = 'openrouter-api-key' | 'workos-session' | 'workos-pkce';

export interface SecretCipher {
  available(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export interface SecretPersistence {
  read(name: SecureSecretName): string | undefined;
  write(name: SecureSecretName, value: string): void;
  remove(name: SecureSecretName): void;
}

export class EncryptedSecretVault {
  constructor(
    private readonly persistence: SecretPersistence,
    private readonly cipher: SecretCipher,
  ) {}

  encryptionAvailable(): boolean {
    return this.cipher.available();
  }

  has(name: SecureSecretName): boolean {
    return Boolean(this.persistence.read(name));
  }

  set(name: SecureSecretName, value: string): void {
    if (!this.cipher.available()) {
      throw new Error('Secure credential storage is not available on this device.');
    }
    if (!value) throw new Error('A credential value is required.');
    this.persistence.write(name, this.cipher.encrypt(value));
  }

  get(name: SecureSecretName): string | null {
    const encrypted = this.persistence.read(name);
    if (!encrypted) return null;
    if (!this.cipher.available()) {
      throw new Error('Secure credential storage is not available on this device.');
    }
    return this.cipher.decrypt(encrypted);
  }

  remove(name: SecureSecretName): void {
    this.persistence.remove(name);
  }
}
