// PIN-код хранится только на этом устройстве (хэш в localStorage), на сервер не отправляется.
const k = l => 'fin_pin_' + l
async function sha(s) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pin::' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('') }
  catch { let h = 5381; for (const c of 'pin::' + s) h = (h * 33) ^ c.charCodeAt(0); return 'f' + (h >>> 0) }
}
export const hasPin = l => !!localStorage.getItem(k(l))
export const setPin = async (l, pin) => localStorage.setItem(k(l), await sha(l + pin))
export const checkPin = async (l, pin) => localStorage.getItem(k(l)) === (await sha(l + pin))
export const clearPin = l => localStorage.removeItem(k(l))
