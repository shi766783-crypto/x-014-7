import { config } from '../data'

export const BACKUP_VERSION = 1
export const MAX_FILE_SIZE = 10 * 1024 * 1024

const COLLECTIONS = [
  { key: 'documents', label: '证件档案', required: ['id', 'name'], dates: ['issued', 'expires'] },
  { key: 'usages', label: '使用记录', required: ['id', 'documentId', 'date'], dates: ['date'] },
  { key: 'policies', label: '家庭保险', required: ['id', 'company', 'type'], dates: ['expires'] },
]
const MAX_ERRORS = 8
const isDateString = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())

export function buildBackup(state) {
  return {
    app: config.storageKey,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { documents: state.documents, usages: state.usages, policies: state.policies },
  }
}

export function downloadBackup(state) {
  const backup = buildBackup(state)
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `家档管家备份-${backup.exportedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function inspectBackup(text) {
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['文件无法解析：内容不是有效的 JSON，文件可能已损坏或被修改。'] }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['文件结构不正确：备份文件顶层应是一个对象，包含 app、version、data 三部分。'] }
  }
  const errors = []
  let problemCount = 0
  const report = (message) => { problemCount += 1; if (errors.length < MAX_ERRORS) errors.push(message) }
  if (payload.app !== config.storageKey) {
    const found = typeof payload.app === 'string' ? `「${payload.app}」` : '空'
    report(`来源标识不符：读到 ${found}，应为「${config.storageKey}」，该文件可能不是本应用导出的备份。`)
  }
  if (typeof payload.version !== 'number' || payload.version < 1) report('缺少有效的备份版本号（version），无法确认文件兼容性。')
  else if (payload.version > BACKUP_VERSION) report(`备份版本 v${payload.version} 高于当前支持的 v${BACKUP_VERSION}，请在新版本应用中打开。`)
  const data = payload.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    report('缺少 data 数据区，备份内容不完整。')
  } else {
    for (const { key, label, required, dates } of COLLECTIONS) {
      const list = data[key]
      if (!Array.isArray(list)) { report(`数据区缺少「${label}」列表（${key}），或它不是数组。`); continue }
      const seen = new Set()
      list.forEach((item, index) => {
        const where = `「${label}」第 ${index + 1} 条`
        if (!item || typeof item !== 'object' || Array.isArray(item)) { report(`${where}不是有效的记录对象。`); return }
        for (const field of required) {
          if (typeof item[field] !== 'string' || !item[field].trim()) report(`${where}缺少必填字段「${field}」。`)
        }
        if (typeof item.id === 'string' && item.id) {
          if (seen.has(item.id)) report(`${where}的 id「${item.id}」在文件中重复出现。`)
          seen.add(item.id)
        }
        for (const field of dates) {
          if (item[field] && !isDateString(item[field])) report(`${where}的「${field}」日期格式不正确，应为 YYYY-MM-DD。`)
        }
        if (key === 'policies' && item.premium !== undefined && typeof item.premium !== 'number') report(`${where}的保费（premium）应为数字。`)
      })
    }
  }
  if (problemCount) {
    if (problemCount > errors.length) errors.push(`……以及另外 ${problemCount - errors.length} 个问题。`)
    return { ok: false, errors }
  }
  return {
    ok: true,
    data: Object.fromEntries(COLLECTIONS.map(({ key }) => [key, data[key]])),
    summary: {
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : null,
      counts: Object.fromEntries(COLLECTIONS.map(({ key }) => [key, data[key].length])),
    },
  }
}
