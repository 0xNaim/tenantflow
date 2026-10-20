import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class MfaCryptoService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const encoded = configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.key = Buffer.from(encoded, 'base64');

    if (this.key.length !== 32) {
      throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(encrypted: string): string {
    try {
      const [ivEncoded, tagEncoded, ciphertextEncoded] = encrypted.split(':');

      if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
        throw new Error('Malformed encrypted value');
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(ivEncoded, 'base64'),
      );

      decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextEncoded, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Unable to decrypt MFA secret');
    }
  }
}
