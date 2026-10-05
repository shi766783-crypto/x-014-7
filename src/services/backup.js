import { config } from '../data'

export const BACKUP_KIND = 'family-document-keeper-backup'
export const BACKUP_VERSION = 1
export const COLLECTIONS = ['documents', 'usages', 'policies']
export const COLLECTION_LABELS = { documents: '证件档案', usages: '使用记录', policies: '家庭保险' }
const REQUIRED_FIELDS = { documents: ['name'], usages: ['date'], policies: ['type'] }

export function buildBackup(state) {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    app: config.storageKey,
    exportedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify({
      documents: state.documents,
      usages: state.usages,
      policies: state.policies,
    })),
  }
}

export function downloadBackup(state) {
  const backup = buildBackup(state)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `家档管家备份-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function validateBackup(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, errors: ['文件为空，没有可导入的内容。'] }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['文件不是合法的 JSON，可能已损坏或被修改过。'] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['文件内容不是备份数据对象，格式不符。'] }
  }
  const errors = []
  if (parsed.kind !== BACKUP_KIND) {
    errors.push('缺少正确的备份标识（kind），这不是本应用导出的备份文件。')
  }
  if (typeof parsed.version !== 'number' || parsed.version < 1 || parsed.version > BACKUP_VERSION) {
    errors.push(`备份版本不受支持（文件版本：${parsed.version ?? '未知'}，当前支持版本：${BACKUP_VERSION}）。`)
  }
  const data = parsed.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('缺少 data 数据区，备份内容不完整。')
  } else {
    for (const name of COLLECTIONS) {
      const list = data[name]
      if (!Array.isArray(list)) {
        errors.push(`「${COLLECTION_LABELS[name]}」数据缺失或不是列表。`)
        continue
      }
      list.forEach((item, index) => {
        const where = `「${COLLECTION_LABELS[name]}」第 ${index + 1} 条`
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`${where}：不是有效的记录对象。`)
          return
        }
        if (typeof item.id !== 'string' || !item.id) {
          errors.push(`${where}：缺少记录 id。`)
        }
        for (const field of REQUIRED_FIELDS[name]) {
          if (typeof item[field] !== 'string' || !item[field]) {
            errors.push(`${where}：缺少必填字段「${field}」。`)
          }
        }
      })
    }
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, data: { documents: data.documents, usages: data.usages, policies: data.policies } }
}

export function mergeData(current, incoming) {
  const merged = {}
  const summary = {}
  for (const name of COLLECTIONS) {
    const existing = current[name] || []
    const ids = new Set(existing.map((item) => item.id))
    const fresh = incoming[name].filter((item) => !ids.has(item.id))
    merged[name] = [...existing, ...fresh]
    summary[name] = { added: fresh.length, skipped: incoming[name].length - fresh.length }
  }
  return { merged, summary }
}
