import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../public/foodcourt-evolution.html', import.meta.url), 'utf8')

test('AI evolution page follows the five-tab design handoff with overview as default', () => {
  const tabs = [...page.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(tabs, ['overview', 'curve', 'records', 'settings', 'evolution'])
  assert.match(page, /id="tabOverview"[^>]*data-panel="overview">/)
  for (const panel of ['tabCurve', 'tabRecords', 'tabSettings', 'tabEvolution']) {
    assert.match(page, new RegExp(`id="${panel}"[^>]*hidden`))
  }
  assert.match(page, /selectTab\('overview', false\)/)
})

test('each existing live-data block remains assigned to the intended tab', () => {
  assert.match(page, /id="tabOverview"[\s\S]*id="kpiGrid"[\s\S]*<\/section>/)
  assert.match(page, /id="tabCurve"[\s\S]*id="mapeSvg"[\s\S]*<\/section>/)
  assert.match(page, /id="tabRecords"[\s\S]*id="histTbody"[\s\S]*<\/section>/)
  assert.match(page, /id="tabSettings"[\s\S]*id="passingScoreRange"[\s\S]*<\/section>/)
  assert.match(page, /id="tabEvolution"[\s\S]*id="readinessCard"[\s\S]*id="ragCard"[\s\S]*id="loopCard"[\s\S]*<\/section>/)
  assert.match(page, /\/foodcourt\/evolution-history\?store_key=marugoS/)
  assert.match(page, /\/foodcourt\/prompt-evaluation-sets\/bootstrap/)
})

test('records default to twelve rows and can expand to all rows', () => {
  assert.match(page, /let showAllHistory = false/)
  assert.match(page, /allRows\.slice\(0,12\)/)
  assert.match(page, /直近12件だけ表示/)
})

test('evaluation distinguishes issued forecasts from retrospective results without demo values', () => {
  assert.match(page, /本番・事前予測/)
  assert.match(page, /参考・過去の再計算/)
  assert.match(page, /評価条件切替・比較不可/)
  assert.match(page, /prev\.evaluation_version===row\.evaluation_version/)
  assert.doesNotMatch(page, /最高精度モード|stars =|24\.5<small>|27\.5<small>/)
  assert.doesNotMatch(page, /<script>\s*document\.getElementById\('authCard'\)\.hidden = true/)
})

test('page ids remain unique after the layout reorganization', () => {
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length)
})
