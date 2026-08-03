// data.json 품질 점검 — 앱이 렌더링/채점할 수 없는 데이터와 설계 규칙 위반을 찾아냅니다.
// 사용법: node check.mjs
//
// build.mjs 도 이 파일의 validate() 를 그대로 씁니다. 규칙은 여기 한 곳에만 둡니다.
// 규칙의 설계 근거는 DESIGN.md 를 보세요. 여기의 코드는 그 문서의 기계 강제 버전입니다.
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

// 레슨 템플릿: 입력 → 인식·판단 → 문형 → 조립 → 산출 → 담화 (DESIGN.md §2)
const STAGE = { listen: 0, match: 1, choice: 2, ox: 3, blank: 4, wordbank: 5, speak: 6, order: 7 };
const CORE = ['listen', 'wordbank', 'speak'];   // 레슨마다 정확히 1개씩
const LESSON_SIZE = 6;

// 유닛별 문장 길이 상한 (단어 수) — listen.audio / speak.text 에 적용 (DESIGN.md §3)
const LEN_CAP = [8, 10, 11, 12, 12];

const normEn = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const wordsOf = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);

/** accept 문장이 answer+extra 타일 멀티셋으로 조립 가능한지 */
function buildable(accept, answer, extra) {
  const pool = [...wordsOf(answer), ...(extra || [])];
  for (const w of wordsOf(accept)) {
    const i = pool.indexOf(w);
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
}

/**
 * 전체 데이터를 검증한다.
 * @returns {{errors:string[], warns:string[], stats:object}}
 */
export function validate(data) {
  const errors = [];
  const warns = [];
  const stats = { tracks: 0, units: 0, lessons: 0, questions: 0, byType: {}, byTrack: {}, avgLen: {} };

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
      return; // 준비 중 트랙은 문항 검사를 하지 않는다
    }

    stats.tracks++;
    stats.byTrack[tid] = 0;
    let oxTrue = 0, oxAll = 0;

    units.forEach((u, ui) => {
      if (!u || !u.title || !Array.isArray(u.lessons)) {
        errors.push(`${tid} U${ui + 1}: 유닛 구조 오류`);
        return;
      }
      stats.units++;
      const seenPrompts = new Map();
      const cap = LEN_CAP[Math.min(ui, LEN_CAP.length - 1)];
      let lenSum = 0, lenN = 0;

      u.lessons.forEach((l, li) => {
        if (!l || !l.title || !Array.isArray(l.questions)) {
          errors.push(`${tid} U${ui + 1}-L${li + 1}: 레슨 구조 오류`);
          return;
        }
        stats.lessons++;
        const ltag = `${tid} U${ui + 1}-L${li + 1}`;

        /* ---- 레슨 구성 규칙 ---- */
        const typesInLesson = l.questions.map(x => x.type);
        if (l.questions.length !== LESSON_SIZE) errors.push(`${ltag}: 문항 ${l.questions.length}개 — 레슨은 ${LESSON_SIZE}문항`);
        if (new Set(typesInLesson).size !== typesInLesson.length) errors.push(`${ltag}: 같은 유형이 두 번 — 레슨 내 유형은 모두 달라야 함`);
        CORE.forEach(c => { if (!typesInLesson.includes(c)) errors.push(`${ltag}: 필수 유형 ${c} 없음`); });
        for (let i = 1; i < typesInLesson.length; i++) {
          const a = STAGE[typesInLesson[i - 1]], b = STAGE[typesInLesson[i]];
          if (a !== undefined && b !== undefined && a > b) {
            errors.push(`${ltag}: 문항 순서 위반 — ${typesInLesson[i - 1]} 뒤에 ${typesInLesson[i]} (입력→인식→조립→산출 순서)`);
            break;
          }
        }

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

          // 같은 유닛 안에서 같은 유형이 같은 지문을 두 번 쓰는지 (listen↔speak 같은 의도적 반복은 허용)
          const key = q.type + '|' + (q.prompt || q.audio || q.text || '').replace(/\s/g, '');
          if (key.length > q.type.length + 1) {
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
            else {
              if (Array.isArray(q.options) && q.options[q.answerIndex] !== q.audio) {
                errors.push(`${tag}: 정답 보기가 audio와 다릅니다 — "${q.options[q.answerIndex]}" ≠ "${q.audio}"`);
              }
              const n = wordsOf(q.audio).length;
              lenSum += n; lenN++;
              if (n > cap) errors.push(`${tag}: 문장이 ${n}단어 — U${ui + 1} 상한 ${cap}단어 초과`);
              // 보기끼리 소리 구분이 무의미하게 같은 경우
              if (Array.isArray(q.options) && new Set(q.options.map(normEn)).size !== q.options.length) {
                errors.push(`${tag}: 보기들이 정규화하면 동일 — 듣기 변별 불가`);
              }
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
            else { oxAll++; if (q.answerBool) oxTrue++; }
            if (q.options) warns.push(`${tag}: ox에 불필요한 options`);
          }

          if (q.type === 'match') {
            if (!Array.isArray(q.pairs) || q.pairs.length !== 4) errors.push(`${tag}: pairs가 4개가 아님`);
            else if (q.pairs.some(p => !Array.isArray(p) || p.length !== 2)) errors.push(`${tag}: pairs 형식 오류`);
            else {
              const L = q.pairs.map(p => p[0]), R = q.pairs.map(p => p[1]);
              if (new Set(L).size !== 4) errors.push(`${tag}: 왼쪽 항목 중복 — 채점 불가`);
              if (new Set(R).size !== 4) errors.push(`${tag}: 오른쪽 항목 중복 — 채점 불가`);
              if (!L.every(v => /[a-z]/i.test(v))) warns.push(`${tag}: 왼쪽 열은 학습 언어(영어)여야 합니다`);
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
              q.sequence.forEach(v => { if (v.length > 24) warns.push(`${tag}: 순서 항목이 김(${v.length}자) — "${v}"`); });
            }
          }

          if (q.type === 'wordbank') {
            if (!q.answer || !q.answer.trim()) { errors.push(`${tag}: answer 없음`); return; }
            const aw = wordsOf(q.answer);
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
                if (aw.includes(w)) warns.push(`${tag}: extra "${w}"가 정답 단어와 같음`);
              });
            }
            // accept: 타일로 실제 조립 가능한 대체 정답만 허용
            if (q.accept !== undefined) {
              if (!Array.isArray(q.accept) || q.accept.some(a => typeof a !== 'string')) {
                errors.push(`${tag}: accept는 문자열 배열이어야 함`);
              } else q.accept.forEach(a => {
                if (a === q.answer) warns.push(`${tag}: accept "${a}"가 answer와 동일`);
                else if (!buildable(a, q.answer, extra)) errors.push(`${tag}: accept "${a}"는 타일로 조립 불가`);
              });
            }
          }

          if (q.type === 'speak') {
            if (!q.text || !q.text.trim()) errors.push(`${tag}: text(따라 말할 문장) 없음`);
            else {
              const n = wordsOf(q.text).length;
              lenSum += n; lenN++;
              if (n > cap) errors.push(`${tag}: 문장이 ${n}단어 — U${ui + 1} 상한 ${cap}단어 초과`);
              if (n > 12) warns.push(`${tag}: 문장이 길어 발음 채점이 불안정할 수 있음`);
            }
            if (!q.meaning) warns.push(`${tag}: meaning(뜻) 없음`);
          }
        });
      });

      stats.avgLen[`U${ui + 1}`] = lenN ? +(lenSum / lenN).toFixed(2) : 0;
    });

    // OX 정답 편향 (트랙 단위)
    if (oxAll >= 5) {
      const ratio = oxTrue / oxAll;
      if (ratio > 0.7 || ratio < 0.3) warns.push(`track "${tid}": ox 정답 편향 — 참 ${oxTrue} : 거짓 ${oxAll - oxTrue}`);
    }
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
  console.log('유닛별 평균 문장 길이(듣기·말하기, 단어):', Object.entries(stats.avgLen).map(([k, v]) => `${k} ${v}`).join(', '));
  const sealed = (data.tracks || []).filter(t => t.status !== 'live');
  if (sealed.length) console.log('준비 중 트랙:', sealed.map(t => `${t.title}(${t.id})`).join(', '));
  if (warns.length) console.log(`\n[경고 ${warns.length}건]\n` + warns.join('\n'));
  if (errors.length) { console.error(`\n[오류 ${errors.length}건]\n` + errors.join('\n')); process.exit(1); }
  console.log('\n오류 없음 — 앱에 사용할 수 있습니다.');
}
