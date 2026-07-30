#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'))
}

function readCargoPackageVersion(relativePath) {
  const lines = readFileSync(join(repoRoot, relativePath), 'utf8').split(/\r?\n/)
  let inPackageSection = false

  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/)
    if (section) {
      inPackageSection = section[1] === 'package'
      continue
    }

    if (inPackageSection) {
      const version = line.match(/^\s*version\s*=\s*"([^"]+)"\s*$/)
      if (version) return version[1]
    }
  }

  throw new Error(`Unable to find [package].version in ${relativePath}`)
}

const packageJson = readJson('soulmate/package.json')
const packageLock = readJson('soulmate/package-lock.json')
const tauriConfig = readJson('soulmate/src-tauri/tauri.conf.json')
const versions = {
  'soulmate/package.json': packageJson.version,
  'soulmate/package-lock.json': packageLock.version,
  'soulmate/package-lock.json packages[""]': packageLock.packages?.['']?.version,
  'soulmate/src-tauri/Cargo.toml': readCargoPackageVersion('soulmate/src-tauri/Cargo.toml'),
  'soulmate/src-tauri/tauri.conf.json': tauriConfig.version,
}

const invalidEntries = Object.entries(versions).filter(
  ([, version]) => typeof version !== 'string' || !version,
)
if (invalidEntries.length > 0) {
  throw new Error(`Missing version values: ${invalidEntries.map(([source]) => source).join(', ')}`)
}

const uniqueVersions = new Set(Object.values(versions))
if (uniqueVersions.size !== 1) {
  console.error('SoulMate version mismatch:')
  for (const [source, version] of Object.entries(versions)) {
    console.error(`  ${source}: ${version}`)
  }
  process.exit(1)
}

const [version] = uniqueVersions
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
if (!semverPattern.test(version)) {
  throw new Error(`Application version is not valid SemVer: ${version}`)
}

const tagArgumentIndex = process.argv.indexOf('--tag')
const releaseTag =
  tagArgumentIndex >= 0 ? process.argv[tagArgumentIndex + 1] : process.env.RELEASE_TAG

if (tagArgumentIndex >= 0 && !releaseTag) {
  throw new Error('The --tag option requires a value')
}

if (releaseTag) {
  const normalizedTag = releaseTag.replace(/^refs\/tags\//, '').replace(/^v/, '')
  if (normalizedTag !== version) {
    throw new Error(`Release tag ${releaseTag} does not match application version ${version}`)
  }
}

console.log(`SoulMate version ${version} is consistent across package, lockfile, Cargo, and Tauri config.`)
