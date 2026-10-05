import { computed, reactive, ref } from 'vue'
import { createStorage } from '../services/storage'
import { config, seed } from '../data'

const storage = createStorage(config.storageKey, seed)
const snapshotKey = `${config.storageKey}-import-snapshot`
const COLLECTIONS = ['documents', 'usages', 'policies']
export function useKeeper() {
  const state = reactive(storage.read())
  const persist = () => storage.write(state)
  const canUndoImport = ref(!!localStorage.getItem(snapshotKey))
  const clearSnapshot = () => { localStorage.removeItem(snapshotKey); canUndoImport.value = false }
  const add = (collection, item) => { clearSnapshot(); state[collection].unshift({ id: `${collection}-${Date.now()}`, createdAt: new Date().toISOString(), ...item }); persist() }
  const update = (collection, id, patch) => { const item = state[collection].find((entry) => entry.id === id); if (item) { clearSnapshot(); Object.assign(item, patch); persist() } }
  const remove = (collection, id) => { clearSnapshot(); state[collection] = state[collection].filter((entry) => entry.id !== id); persist() }
  const reset = () => { clearSnapshot(); Object.assign(state, structuredClone(seed)); persist() }
  const applyImport = (data, mode) => {
    try { localStorage.setItem(snapshotKey, JSON.stringify(Object.fromEntries(COLLECTIONS.map((key) => [key, state[key]])))); canUndoImport.value = true } catch { canUndoImport.value = false }
    const incoming = structuredClone(data)
    let added = 0
    let updated = 0
    if (mode === 'overwrite') {
      for (const key of COLLECTIONS) { state[key] = incoming[key]; added += incoming[key].length }
    } else {
      for (const key of COLLECTIONS) {
        const merged = new Map(state[key].map((entry) => [entry.id, entry]))
        for (const item of incoming[key]) {
          if (merged.has(item.id)) updated += 1
          else added += 1
          merged.set(item.id, item)
        }
        state[key] = [...merged.values()]
      }
    }
    persist()
    return { added, updated }
  }
  const undoImport = () => {
    const raw = localStorage.getItem(snapshotKey)
    if (!raw) return
    try {
      const saved = JSON.parse(raw)
      for (const key of COLLECTIONS) if (Array.isArray(saved[key])) state[key] = saved[key]
      persist()
    } catch { /* 快照损坏时仅清除，不再恢复 */ }
    clearSnapshot()
  }
  const metrics = computed(() => config.metrics.map((metric) => ({ ...metric, value: metric.value ? metric.value(state) : state[metric.collection]?.length || 0 })))
  return { state, add, update, remove, reset, persist, metrics, applyImport, undoImport, canUndoImport }
}
