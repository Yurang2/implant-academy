// data.json 품질 점검 — 앱이 렌더링/채점할 수 없는 데이터를 찾아냅니다.
// 사용법: node check.mjs
//
// build.mjs 도 이 파일의 validate() 를 그대로 씁니다. 규칙은 여기 한 곳에만 둡니다.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/** data.json 을 읽어 { schema, tracks } 형태로 정규화한다. */
export function loadData(file) {
  const raw = JSON.parse(fs.readFileSync(file || path.join(DIR, 'data.json'), 'utf8'));
  // v1(유닛 배열)도 계속 읽을 수 있게 감싸 준다.
  if (Array.isArray(raw)) {
    return { schema: 1, tracks: [{ id: 'default', title: '기본', lang: 'ko-KR', status: 'live', units: raw }] };
  }
  return raw;
}

const TYPES = ['choice', 'ox', 'blank', 'match', 'order', 'listen', 'wordbank', 'speak'];

/**
 * 전체 데이터를 검증한다.
 * @returns {{errors:string[], warns:string[], stats:object}}
 */
export function validate(data) {
  const errors = [];
  const warns = [];
  const stats = { tracks: 0, units: 0, lessons: 0, questions: 0, byType: {}, byTrack: {} };

  const tracks = data.tracks || [];
  if (!tracks.length) errors.push('tracks 가 비어 있습니다.');

  const seenTrackIds = new Set();
  tracks.forEach((t, ti) => {
    const tid = t.id || `track${ti + 1}`;
    if (seenTrackIds.has(tid)) errors.push(`track "${tid}": id 중복`);
    seenTrackIds.add(tid);
    if (!t.title) errors.push(`track "${tid}": title 없음`);
    if (!t.lang) warns.push(`track "${tid}": lang 없음 — 음성 재생이 기본값(en-US)으로 동작합니다`);

    const units = t.units || [];
    if (t.status === 'live' && !units.length) {
      errors.push(`track "${tid}": status가 live인데 units가 비어 있습니다`);
    }
    if (t.status !== 'live') {
      if (units.length) warns.push(`track "${tid}": live가 아닌데 units에 내용이 있습니다`);
      return; // 봉인/준비 중 트랙은 문항 검사를 하지 않는다
    }

    stats.tracks++;
    stats.byTrack[tid] = 0;

    units.forEach((u, ui) => {
      if (!u || !u.title || !Array.isArray(u.lessons)) {
        errors.push(`${tid} U${ui + 1}: 유닛 구조 오류`);
        return;
      }
      stats.units++;
      const seenPrompts = new Map();

      u.lessons.forEach((l, li) => {
        if (!l || !l.title || !Array.isArray(l.questions)) {
          errors.push(`${tid} U${ui + 1}-L${li + 1}: 레슨 구조 오류`);
          return;
        }
        stats.lessons++;

        l.questions.forEach((q, qi) => {
          stats.questions++;
          stats.byTrack[tid]++;
          stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
          const tag = `${tid} U${ui + 1}-L${li + 1}-Q${qi + 1}(${q.type})`;

          if (!TYPES.includes(q.type)) { errors.push(`${tag}: 알 수 없는 유형`); return; }
          if (!q.explanation || !q.explanation.trim()) errors.push(`${tag}: explanation 비어 있음`);

          // prompt 는 listen/speak 을 뺀 모든 유형에 필요하다 (match 는 기본 문구로 대체 가능)
          const needsPrompt = !['listen', 'speak', 'match'].includes(q.type);
          if (needsPrompt && (!q.prompt || !q.prompt.trim())) errors.push(`${tag}: prompt 비어 있음`);

          // 같은 유닛 안에서 같은 지문을 두 번 묻지 않는지
          const key = (q.prompt || q.audio || q.text || '').replace(/\s/g, '');
          if (key) {
            if (seenPrompts.has(key)) warns.push(`${tag}: ${seenPrompts.get(key)}와 지문 중복`);
            else seenPrompts.set(key, tag);
          }

          if (q.type === 'choice' || q.type === 'blank' || q.type === 'listen') {
            if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${tag}: options가 4개가 아님`);
            else {
              if (new Set(q.options).size !== 4) errors.push(`${tag}: 보기 중복 — ${q.options.join(' / ')}`);
              q.options.forEach((o, i) => { if (!o || !o.trim()) errors.push(`${tag}: 보기 ${i + 1} 비어 있음`); });
            }
            if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) {
              errors.push(`${tag}: answerIndex 범위 오류(${q.answerIndex})`);
            }
            if ('answerBool' in q) warns.push(`${tag}: 불필요한 answerBool`);
          }

          if (q.type === 'listen') {
            if (!q.audio || !q.audio.trim()) errors.push(`${tag}: audio(들려줄 문장) 없음`);
            else if (Array.isArray(q.options) && q.options[q.answerIndex] !== q.audio) {
              errors.push(`${tag}: 정답 보기가 audio와 다릅니다 — "${q.options[q.answerIndex]}" ≠ "${q.audio}"`);
            }
          }

          if (q.type === 'blank') {
            const n = ((q.prompt || '').match(/___/g) || []).length;
            if (n === 0) errors.push(`${tag}: prompt에 "___" 없음`);
            if (n > 1) warns.push(`${tag}: "___"가 ${n}개 — 첫 번째만 빈칸으로 렌더링됨`);
            if (!q.hint) warns.push(`${tag}: hint(뜻) 없음 — 학습자가 문맥을 잡기 어렵습니다`);
          }

          if (q.type === 'ox') {
            if (typeof q.answerBool !== 'boolean') errors.push(`${tag}: answerBool 없음`);
            if (q.options) warns.push(`${tag}: ox에 불필요한 options`);
          }

          if (q.type === 'match') {
            if (!Array.isArray(q.pairs) || q.pairs.length !== 4) errors.push(`${tag}: pairs가 4개가 아님`);
            else if (q.pairs.some(p => !Array.isArray(p) || p.length !== 2)) errors.push(`${tag}: pairs 형식 오류`);
            else {
              const L = q.pairs.map(p => p[0]), R = q.pairs.map(p => p[1]);
              if (new Set(L).size !== 4) errors.push(`${tag}: 왼쪽 항목 중복 — 채점 불가`);
              if (new Set(R).size !== 4) errors.push(`${tag}: 오른쪽 항목 중복 — 채점 불가`);
              [...L, ...R].forEach(v => {
                if (!v || !v.trim()) errors.push(`${tag}: 빈 항목`);
                else if (v.length > 16) warns.push(`${tag}: 항목이 김(${v.length}자) — "${v}"`);
              });
            }
          }

          if (q.type === 'order') {
            if (!Array.isArray(q.sequence) || q.sequence.length < 3 || q.sequence.length > 5) {
              errors.push(`${tag}: sequence 길이 오류(3~5개)`);
            } else {
              if (new Set(q.sequence).size !== q.sequence.length) errors.push(`${tag}: 순서 항목 중복 — 채점 불가`);
              q.sequence.forEach(v => { if (v.length > 20) warns.push(`${tag}: 순서 항목이 김(${v.length}자) — "${v}"`); });
            }
          }

          if (q.type === 'wordbank') {
            if (!q.answer || !q.answer.trim()) { errors.push(`${tag}: answer 없음`); return; }
            const aw = q.answer.trim().split(/\s+/);
            if (aw.length < 2) errors.push(`${tag}: answer가 한 단어 — 문장 만들기가 성립하지 않음`);
            if (aw.length > 9) warns.push(`${tag}: answer가 ${aw.length}단어 — 모바일에서 두 줄을 넘길 수 있음`);
            if (q.answer !== q.answer.trim() || /\s{2,}/.test(q.answer)) errors.push(`${tag}: answer에 여분의 공백`);
            if (/[.,!?;]/.test(q.answer)) errors.push(`${tag}: answer에 문장부호 — 타일 채점이 어긋납니다`);
            const extra = q.extra || [];
            if (!Array.isArray(extra)) errors.push(`${tag}: extra는 배열이어야 함`);
            else {
              if (!extra.length) warns.push(`${tag}: 오답 타일(extra) 없음 — 난이도가 매우 낮습니다`);
              extra.forEach(w => {
                if (/\s/.test(w)) errors.push(`${tag}: extra "${w}"에 공백 — 타일 하나에 한 단어만`);
                if (aw.includes(w)) warns.push(`${tag}: extra "${w}"가 정답 단어와 같음 — 정답이 여러 개가 됩니다`);
              });
            }
          }

          if (q.type === 'speak') {
            if (!q.text || !q.text.trim()) errors.push(`${tag}: text(따라 말할 문장) 없음`);
            else if (q.text.trim().split(/\s+/).length > 12) warns.push(`${tag}: 문장이 길어 발음 채점이 불안정할 수 있음`);
            if (!q.meaning) warns.push(`${tag}: meaning(뜻) 없음`);
          }
        });
      });
    });
  });

  return { errors, warns, stats };
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const data = loadData(process.argv[2]);
  const { errors, warns, stats } = validate(data);
  console.log(`트랙 ${stats.tracks}개(공개) / 유닛 ${stats.units}개 / 레슨 ${stats.lessons}개 / 문항 ${stats.questions}개`);
  console.log('유형 분포:', Object.entries(stats.byType).map(([k, v]) => `${k} ${v}`).join(', ') || '없음');
  const sealed = (data.tracks || []).filter(t => t.status !== 'live');
  if (sealed.length) console.log('봉인/준비 중 트랙:', sealed.map(t => `${t.title}(${t.id})`).join(', '));
  if (warns.length) console.log(`\n[경고 ${warns.length}건]\n` + warns.join('\n'));
  if (errors.length) { console.error(`\n[오류 ${errors.length}건]\n` + errors.join('\n')); process.exit(1); }
  console.log('\n오류 없음 — 앱에 사용할 수 있습니다.');
}
