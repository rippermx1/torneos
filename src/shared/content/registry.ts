import common from '@content/es-CL/common.json'

/** To add a namespace: create content/es-CL/<name>.json and register it here. */
export const contentRegistry = {
  common,
}

export type ContentRegistry = typeof contentRegistry
export type ContentNamespace = keyof ContentRegistry
