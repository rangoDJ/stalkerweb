const listeners = new Set()
let nextId = 1

export function showToast(message, type = 'info') {
  const id = nextId++
  listeners.forEach(fn => fn({ id, message, type }))
}

export function subscribeToasts(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
