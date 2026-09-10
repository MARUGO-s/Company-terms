export type ExtractedTokyoDomeEvent = {
  event_date: string
  title: string
  category: string
}

export function normalizeBaseballCategory(title: string, category: string): string {
  return /都市対抗|社会人野球|全日本クラブ野球|大学野球|高校野球/.test(title) ? "アマ野球" : category
}

// The official calendar uses both "(月)" and holiday labels such as
// "(月・祝)". Treat both forms as date-cell boundaries.
function isWeekdayLabel(value: string): boolean {
  return /^[（(][日月火水木金土](?:[・･][^）)]{1,12})?[）)]$/.test(value)
}

function markerCategory(value: string): "野球" | "コンサート" | "その他" | null {
  const text = String(value ?? "").trim()
  if (text === "野球") return "野球"
  if (text === "コンサート") return "コンサート"
  if (["イベント", "その他", "展示会", "展示", "格闘技", "プロレス", "式典"].includes(text)) return "その他"
  return null
}

// Parse the text version of the official Tokyo Dome schedule by calendar cell.
// Structure: "YYYY年MM月" -> day -> weekday label -> category/title rows.
export function parseTokyoDomeSchedule(text: string): ExtractedTokyoDomeEvent[] {
  const lines = String(text ?? "").split("\n").map((line) => line.trim())
  const monthPattern = /^(\d{4})年(\d{1,2})月$/
  const isDay = (value: string) => /^\d{1,2}$/.test(value)
  const events: ExtractedTokyoDomeEvent[] = []
  const seen = new Set<string>()
  let currentYear = 0
  let currentMonth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const month = line.match(monthPattern)
    if (month) {
      currentYear = Number(month[1])
      currentMonth = Number(month[2])
      continue
    }
    if (!currentYear || !currentMonth || !isDay(line) || i + 1 >= lines.length || !isWeekdayLabel(lines[i + 1])) continue

    const day = Number(line)
    if (day < 1 || day > 31) continue
    const content: string[] = []
    let next = i + 2
    for (; next < lines.length; next++) {
      const candidate = lines[next]
      if (monthPattern.test(candidate)) break
      if (isDay(candidate) && next + 1 < lines.length && isWeekdayLabel(lines[next + 1])) break
      if (candidate) content.push(candidate)
    }

    const date = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    for (let k = 0; k < content.length; k++) {
      const marker = markerCategory(content[k])
      if (!marker) continue
      let title = ""
      for (let t = k + 1; t < content.length; t++) {
        const candidate = content[t]
        if (markerCategory(candidate)) break
        if (/^(開場|開始|開演|開門|終演|開催)/.test(candidate)) continue
        if (candidate.startsWith("【") || /TEL|電話|お?問い合わせ|チケット|発売/.test(candidate)) continue
        title = candidate
        break
      }
      if (!title || /TOKYO\s*DOME\s*TOUR/i.test(title)) continue

      const category = marker === "野球"
        ? (/(大学|高校|社会人|選手権|リトル|シニア|ボーイズ|女子|クラブ選手権|アマチュア)/.test(title) ? "アマ野球" : "プロ野球")
        : marker === "コンサート" ? "ライブ" : "その他"
      const cleanTitle = title.replace(/\s+/g, " ").slice(0, 200)
      const key = `${date}__${cleanTitle}`
      if (seen.has(key)) continue
      seen.add(key)
      events.push({ event_date: date, title: cleanTitle, category: normalizeBaseballCategory(cleanTitle, category) })
    }
    i = next - 1
  }

  events.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))
  return events
}
