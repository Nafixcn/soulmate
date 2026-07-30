import { describe, expect, it } from 'vitest'
import { portableBackupFilename } from './dataPortability'

describe('portable data backup', () => {
  it('uses a filesystem-safe timestamp in backup filenames', () => {
    expect(portableBackupFilename(new Date('2026-07-30T12:34:56.789Z'))).toBe(
      'soulmate-backup-2026-07-30T12-34-56-789Z.json',
    )
  })
})
