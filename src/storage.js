// Клиент API. Данные хранятся на сервере (Vercel функция + Upstash Redis) и общие для всех устройств.
import { tr } from './i18n.js'

// при локальной разработке (vite на :5173) API берём с vercel dev на :3000
const BASE = (() => {
  const { hostname: h, port: p } = location
  return p === '5173' && (h === 'localhost' || h === '127.0.0.1') ? `http://${h}:3000` : ''
})()
const err = (m, status = 400) => { const e = new Error(tr(m)); e.status = status; return e }

let token = localStorage.getItem('fin_token')
async function req(method, url, body) {
  let r
  try {
    r = await fetch(BASE + '/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch { throw err("Server bilan aloqa yo'q", 0) }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw err(j.error || `Xatolik (${r.status})`, r.status)
  return j
}

export const Api = {
  mode: 'server',
  init: async () => {},
  hasToken: () => !!token,
  async login(login, password) { const j = await req('POST', '/login', { login, password }); token = j.token; localStorage.setItem('fin_token', token); return j.user },
  async logout() { try { await req('POST', '/logout') } catch {} token = null; localStorage.removeItem('fin_token') },
  me: () => req('GET', '/me'),
  getData: () => req('GET', '/data'),
  item: (col, item) => req('POST', '/item', { col, item }),
  delItem: (col, id) => req('DELETE', `/item?col=${col}&id=${encodeURIComponent(id)}`),
  saveProf: patch => req('PUT', '/prof', patch),
  replaceAll: d => req('PUT', '/data', d),
  rates: force => req('GET', '/rates' + (force ? '?refresh=1' : '')),
  adminData: l => req('GET', '/admin-data?login=' + encodeURIComponent(l)),
  adminLog: (l, limit = 100) => req('GET', `/admin-log?limit=${limit}` + (l ? `&login=${encodeURIComponent(l)}` : '')),
  blockUser: (l, disabled) => req('POST', '/admin-block', { login: l, disabled }),
  getAnnounce: () => req('GET', '/admin-announce'),
  setAnnounce: text => req('POST', '/admin-announce', { text }),
  saveName: name => req('PUT', '/me', { name }),
  changePassword: (oldPassword, newPassword) => req('POST', '/me-password', { oldPassword, newPassword }),
  users: () => req('GET', '/admin-users'),
  createUser: u => req('POST', '/admin-users', u),
  resetPassword: (l, password) => req('PATCH', '/admin-password', { login: l, password }),
  deleteUser: l => req('DELETE', `/admin-user?login=${encodeURIComponent(l)}`),
}
