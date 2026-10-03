import { describe, expect, it } from 'vitest'
import { decryptPortableBackup, encryptPortableBackup, isEncryptedPortableBackup } from './dataPortability'

describe('portable backup encryption', () => {
  it('roundtrips a private backup without exposing its contents', async () => {
    const backup = JSON.stringify({ messages: [{ content: '只属于我的秘密' }] })
    const encrypted = await encryptPortableBackup(backup, 'correct horse battery staple')

    expect(isEncryptedPortableBackup(encrypted)).toBe(true)
    expect(encrypted).not.toContain('只属于我的秘密')
    await expect(decryptPortableBackup(encrypted, 'correct horse battery staple')).resolves.toBe(backup)
  })

  it('rejects the wrong password', async () => {
    const encrypted = await encryptPortableBackup('{}', 'correct password')
    await expect(decryptPortableBackup(encrypted, 'wrong password')).rejects.toThrow('密码错误')
  })
})
