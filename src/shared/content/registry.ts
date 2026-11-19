import challengeCard from '@content/es-CL/challenge-card.json'
import common from '@content/es-CL/common.json'

/** To add a namespace: create content/es-CL/<name>.json and register it here. */
export const contentRegistry = {
  common,
  'challenge-card': challengeCard,
}

export type ContentRegistry = typeof contentRegistry
export type ContentNamespace = keyof ContentRegistry
