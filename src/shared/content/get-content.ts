import { mergeContent } from './merge'
import { contentRegistry, type ContentNamespace, type ContentRegistry } from './registry'

export function getContent<N extends ContentNamespace>(namespace: N, overrides?: unknown): ContentRegistry[N] {
  return mergeContent(contentRegistry[namespace], overrides)
}
