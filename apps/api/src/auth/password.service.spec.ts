import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('hashes a password without storing plaintext', async () => {
    const password = 'Strong-Test-Password-2026!';
    const hash = await service.hash(password);

    expect(hash).not.toBe(password);
    expect(hash).toContain('$argon2id$');
  });

  it('verifies the correct password', async () => {
    const hash = await service.hash('Strong-Test-Password-2026!');

    await expect(
      service.verify(hash, 'Strong-Test-Password-2026!'),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('Strong-Test-Password-2026!');

    await expect(service.verify(hash, 'Wrong-Password')).resolves.toBe(false);
  });

  it('fails closed for an invalid hash', async () => {
    await expect(service.verify('invalid-hash', 'any-password')).resolves.toBe(
      false,
    );
  });
});
