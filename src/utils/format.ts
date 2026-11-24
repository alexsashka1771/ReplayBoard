const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
}

export function formatDate(timestamp: number) {
  const date = new Date(timestamp)
  return date.toDateString() === new Date().toDateString()
    ? 'Сегодня, ' + timeFormat.format(date)
    : dateFormat.format(date)
}
