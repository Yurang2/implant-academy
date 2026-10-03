// 브라우저 흐름 테스트: 로그인 → 레슨(오답 1개 포함) → 결과 → 홈 지표 → 시간 경과 → 복습 → 내보내기
const { chromium } = require('playwright');
const path = require('path');
const SP = require('os').tmpdir();
const URL = 'file://' + require('path').join(__dirname, 'index.html');

(async () => {
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  // 테스트 중 TTS가 실제 스피커로 나오지 않게: 말하기는 소리 없이 바로 끝난 것으로 처리
  await ctx.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 0);
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const assert = (c, msg) => { if (!c) { throw new Error('ASSERT: ' + msg); } console.log('  ✓ ' + msg); };
  // 레벨업 오버레이는 결과 화면 1.1초 뒤에 떠서 화면을 옮겨도 남는다 → 어느 클릭이든 가리면 먼저 닫기
  let lvups = 0;
  await page.addLocatorHandler(page.locator('.lvup'), async () => { lvups++; await page.click('#btn-lvup'); });

  await page.goto(URL);
  await page.fill('#name-input', '홍길동');
  await page.click('#btn-start');
  await page.waitForSelector('#s-home.active');
  assert(await page.evaluate(() => track.id) === 'bridge', '기본 트랙은 임플란트 × 영어');
  assert(await page.locator('#track-row button').count() === 3, '트랙 세그먼트 3개');
  assert(await page.locator('.level-card').count() === 1 && /LV/.test(await page.textContent('.lv-center')), '레벨 카드 노출');
  await page.screenshot({ path: path.join(SP, 'shot-home0.png') });

  // 답하기 도우미 (wrong=true면 틀리게)
  async function answer(wrong) {
    const q = await page.evaluate(() => S.cur.q);
    const t = q.type;
    if (t === 'match') {
      for (const [l, r] of q.pairs) {
        await page.click(`.mL[data-v="${l}"]`); await page.click(`.mR[data-v="${r}"]`);
      }
    } else if (t === 'choice' || t === 'blank' || t === 'listen') {
      const i = wrong ? (q.answerIndex + 1) % 4 : q.answerIndex;
      await page.click(`#q-wrap [data-i="${i}"]`); await page.click('#btn-check');
    } else if (t === 'ox') {
      await page.click(`#q-wrap [data-v="${wrong ? !q.answerBool : q.answerBool}"]`); await page.click('#btn-check');
    } else if (t === 'wordbank') {
      for (const w of q.answer.split(' ')) await page.click(`#wb-bank .chip[data-w="${w}"]:not(.ghosted) >> nth=0`);
      await page.click('#btn-check');
    } else if (t === 'order') {
      for (const v of q.sequence) await page.click(`#order-bank .chip[data-v="${v}"]`);
      await page.click('#btn-check');
    } else if (t === 'explain') {
      await page.fill('#ex-input', '테스트 답안: 뼈에 직접 심고 혼자 선다');
      await page.click('#btn-check');
      await page.waitForSelector('.ex-pt');
      const n = wrong ? 0 : q.points.length;
      for (let i = 0; i < n; i++) await page.click(`.ex-pt[data-i="${i}"]`);
      await page.click('#btn-check');
    }
    await page.waitForSelector('#feedback.show');
    return t;
  }
  async function cont() {
    await page.click('#btn-continue');
    await page.waitForTimeout(260);
  }

  // ---- 레슨 1 ----
  await page.click('.lesson-row.current');
  await page.waitForSelector('#btn-intro-start');
  assert(await page.locator('#hearts').isHidden(), '레슨에 하트 없음');
  await page.click('#btn-intro-start');
  let wrongDone = false, n = 0, shotExplain = false;
  while (await page.evaluate(() => !!S)) {
    const t = await page.evaluate(() => S.cur.q.type);
    assert(await page.locator('.draft-badge').count() === 1, `검수 전 배지 (${t})`);
    if (t === 'explain' && !shotExplain) {
      await page.fill('#ex-input', '임플란트는 뼈에 직접 심고 브릿지는 옆 치아를 깎는다');
      await page.click('#btn-check'); await page.waitForSelector('.ex-pt');
      await page.click('.ex-pt[data-i="0"]'); await page.click('.ex-pt[data-i="1"]');
      await page.screenshot({ path: path.join(SP, 'shot-explain.png') });
      await page.click('#btn-check'); await page.waitForSelector('#feedback.show');
      shotExplain = true;
      await page.screenshot({ path: path.join(SP, 'shot-feedback.png') });
    } else {
      const wrong = !wrongDone && t === 'choice';
      await answer(wrong);
      if (wrong) {
        wrongDone = true;
        // 이 문항 이상해요 → 신고
        await page.click('#fb-flag'); await page.click('.flag-r[data-i="0"]');
        await page.waitForTimeout(300);
      }
      if (t === 'wordbank') { await page.click('#fb-use'); }
    }
    await cont();
    if (++n > 20) throw new Error('loop');
  }
  await page.waitForSelector('#s-result.active');
  await page.screenshot({ path: path.join(SP, 'shot-result.png') });
  const resTxt = await page.textContent('#result-body');
  assert(/LESSON COMPLETE/i.test(resTxt) && /새 카드 6장/.test(resTxt) && /\+6/.test(resTxt), '결과: 레슨 완료 + 새 카드 6장 + 숙련도 +6');
  assert(n === 7, `오답 문항 재출제로 7문항 진행 (실제 ${n})`);
  await page.click('#btn-go-home');
  await page.waitForSelector('#s-home.active');

  const u = await page.evaluate(() => me());
  const ids = Object.keys(u.srs);
  assert(ids.length === 6, 'SRS 카드 6장');
  const lapsed = await page.evaluate(() => Object.entries(me().srs).filter(([id]) => ALL_QMAP[id].type === 'choice').map(([, c]) => c));
  assert(lapsed.length === 1 && lapsed[0].box === 1 && lapsed[0].n === 1, '틀린 choice 카드: 상자 1, 첫 시도만 반영');
  assert(Object.values(u.srs).every(c => c.due === addDaysT(1)), '모든 카드 내일 복습');
  function addDaysT(k) { const d = new Date(); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); }
  assert(u.log.length === 7, '시도 로그 7건');
  assert(u.events.some(e => e.type === 'flag') && u.events.some(e => e.type === 'use') && u.events.some(e => e.type === 'explain'), '신고·써먹음·서술 기록');
  assert(/내일 6장/.test(await page.textContent('#path')), '홈: 내일 6장 안내');
  assert(await page.evaluate(() => masteryPoints(me())) === 6, '숙련도 6점 (새 카드 6장 × 1점)');
  assert(await page.locator('.lesson-row.done').count() === 1, '홈: 완료 레슨 행 1개');
  await page.screenshot({ path: path.join(SP, 'shot-home1.png') });

  // ---- 같은 날 다시 풀기: 상자가 올라가지 않아야 ----
  await page.click('.lesson-row.done >> nth=0');
  await page.click('#btn-intro-start');
  let guard = 0;
  while (await page.evaluate(() => !!S)) { await answer(false); await cont(); if (++guard > 20) throw new Error('loop2'); }
  await page.click('#btn-go-home');
  const u2 = await page.evaluate(() => me());
  assert(Object.values(u2.srs).every(c => c.box === 1), '같은 날 다시 풀기는 상자를 올리지 않음');

  // ---- 시간 경과 시뮬레이션: 복습일을 오늘로 ----
  await page.evaluate(() => {
    const t = todayStr();
    Object.values(me().srs).forEach(c => { c.due = t; c.last = addDays(-8); });
    saveStore(); renderHome();
  });
  assert(await page.locator('#btn-review').count() === 1, '복습 카드 노출');
  await page.click('#btn-review');
  guard = 0;
  while (await page.evaluate(() => !!S)) { await answer(false); await cont(); if (++guard > 20) throw new Error('loop3'); }
  const rtxt = await page.textContent('#result-body');
  assert(/REVIEW COMPLETE/i.test(rtxt) && /6장 중 6장/.test(rtxt) && /\+6/.test(rtxt), '복습 결과: 6장 중 6장 + 숙련도 +6');
  await page.click('#btn-go-home');
  const u3 = await page.evaluate(() => me());
  assert(Object.values(u3.srs).every(c => c.box === 2), '복습 정답 → 상자 2');
  const ret = await page.evaluate(() => retention(me(), 'bridge'));
  assert(ret.n === 6 && ret.ok === 6, '7일+ 기억률 6/6 측정');

  // ---- 표현 노트 ----
  await page.click('#btn-notebook');
  await page.waitForSelector('.nb-item');
  assert(await page.locator('.nb-item').count() === 2, '표현 노트 2개 (wordbank + blank)');
  await page.click('.nb-use >> nth=0');
  await page.screenshot({ path: path.join(SP, 'shot-notebook.png') });
  await page.click('#btn-nb-close');

  // ---- 내보내기 ----
  await page.waitForTimeout(300);
  await page.click('#btn-profile');
  await page.screenshot({ path: path.join(SP, 'shot-profile.png'), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-file')]);
  const out = path.join(SP, 'export.json');
  await dl.saveAs(out);
  const ex = JSON.parse(require('fs').readFileSync(out, 'utf8'));
  assert(ex.format === 'implant-academy-log/1' && Object.keys(ex.questions).length === 6, '내보내기 JSON: 문항 6개 포함');
  assert(ex.summary.tracks.bridge.retention7d.n === 6, '내보내기 요약에 기억률');
  await page.click('#btn-close-modal');

  // ---- 다른 트랙들 회귀: 임상 트랙·영어 트랙 첫 레슨 ----
  for (const tid of ['implant', 'english']) {
    await page.waitForTimeout(250);
    await page.click(`#track-row [data-track="${tid}"]`);
    await page.click('.lesson-row.current');
    if (await page.locator('#btn-intro-start').count()) await page.click('#btn-intro-start');
    guard = 0;
    while (await page.evaluate(() => !!S)) {
      const t = await page.evaluate(() => S.cur.q.type);
      if (t === 'speak') { await page.click('#btn-speak-skip'); await page.waitForSelector('#feedback.show'); }
      else await answer(false);
      await cont(); if (++guard > 20) throw new Error('loop4');
    }
    assert(/LESSON COMPLETE/i.test(await page.textContent('#result-body')), `${tid} 트랙 레슨 완료`);
    await page.click('#btn-go-home');
  }

  // ---- 옛 사용자 마이그레이션: 오답 노트 → 오늘 복습 ----
  await page.evaluate(() => {
    store.users['김철수'] = { xp: 50, streak: 1, lastDay: null, done: { 'implant:u1l1': { stars: 2, best: 80 } }, wrongs: { 'implant:u1l1q1': 2 }, sound: true, track: 'implant' };
    saveStore();
  });
  await page.evaluate(() => login('김철수'));
  const k = await page.evaluate(() => ({ srs: me().srs, due: dueIds().length }));
  assert(k.srs['implant:basics/aq1'] && k.due === 1, '옛 오답 노트가 오늘 복습 카드로 이전');

  // ---- 월반 시험은 하트 3개 ----
  await page.evaluate(() => { setTrack('bridge'); me().track = 'bridge'; renderHome(); });
  await page.click('.jump-btn >> nth=0');
  await page.click('#btn-jump-go');
  assert(await page.evaluate(() => S.hearts) === 3 && await page.locator('#hearts').isVisible(), '월반 시험만 하트 3개');
  assert(await page.evaluate(() => S.queue.every(x => x.q.type !== 'explain')), '월반 시험에 서술형 없음');

  assert(lvups >= 1, `레벨업 오버레이 노출 후 닫힘 (${lvups}회)`);
  assert(errors.length === 0, '콘솔 오류 없음 ' + errors.join(' | '));
  await browser.close();
  console.log('ALL PASSED');
})().catch(e => { console.error(e); process.exit(1); });
