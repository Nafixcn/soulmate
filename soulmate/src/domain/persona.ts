import { DEFAULT_PERSONA, type Persona } from '../types'

export interface NormalizedPersonas {
  personas: Persona[]
  activeIndex: number
}

export function normalizePersonas(
  storedPersonas: Partial<Persona>[],
  requestedActiveIndex: number,
  createId: () => string = () => crypto.randomUUID(),
): NormalizedPersonas {
  const source = storedPersonas.length > 0 ? storedPersonas : [{}]
  const activeIndex = Math.max(0, Math.min(requestedActiveIndex, source.length - 1))
  const usedIds = new Set<string>()

  const personas = source.map((storedPersona, index) => {
    let id = storedPersona.id?.trim() || ''
    if (!id || usedIds.has(id)) {
      id =
        index === activeIndex && !usedIds.has(DEFAULT_PERSONA.id) ? DEFAULT_PERSONA.id : nextUniqueId(usedIds, createId)
    }
    usedIds.add(id)
    return { ...DEFAULT_PERSONA, ...storedPersona, id }
  })

  return { personas, activeIndex }
}

function nextUniqueId(usedIds: Set<string>, createId: () => string): string {
  let id = createId()
  while (!id || usedIds.has(id)) id = createId()
  return id
}
