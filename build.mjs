// app.html(조각) → index.html(단독 실행 파일) 빌드 + 커리큘럼 데이터 주입
// 사용법: node build.mjs [data.json]
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const fragPath = path.join(dir, 'app.html');
let frag = fs.readFileSync(fragPath, 'utf8');

// 데이터 주입 (data.json이 있으면 DATA 블록 교체)
const dataArg = process.argv[2] || path.join(dir, 'data.json');
if (fs.existsSync(dataArg)) {
  const units = JSON.parse(fs.readFileSync(dataArg, 'utf8'));

  // 기계 검증: 앱이 기대하는 형태인지 확인
  const errors = [];
  units.forEach((u, ui) => {
    if (!u || !u.title || !Array.isArray(u.lessons)) { errors.push(`unit${ui + 1}: 구조 오류`); return; }
    u.lessons.forEach((l, li) => {
      (l.questions || []).forEach((q, qi) => {
        const tag = `u${ui + 1}l${li + 1}q${qi + 1}`;
        if (q.type === 'choice' || q.type === 'blank') {
          if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${tag}: options 4개 아님`);
          if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) errors.push(`${tag}: answerIndex 범위 오류`);
          if (q.type === 'blank' && !q.prompt.includes('___')) errors.push(`${tag}: blank에 ___ 없음`);
        } else if (q.type === 'ox') {
          if (typeof q.answerBool !== 'boolean') errors.push(`${tag}: answerBool 없음`);
        } else if (q.type === 'match') {
          if (!Array.isArray(q.pairs) || q.pairs.length !== 4 || q.pairs.some(p => !Array.isArray(p) || p.length !== 2)) errors.push(`${tag}: pairs 오류`);
          if (!q.prompt) q.prompt = '서로 관련 있는 것끼리 짝을 맞춰 보세요.';
        } else if (q.type === 'order') {
          if (!Array.isArray(q.sequence) || q.sequence.length < 3 || q.sequence.length > 5) errors.push(`${tag}: sequence 길이 오류`);
        } else {
          errors.push(`${tag}: 알 수 없는 유형 ${q.type}`);
        }
        if (!q.explanation) errors.push(`${tag}: explanation 없음`);
      });
    });
  });
  if (errors.length) {
    console.error('데이터 검증 실패:\n' + errors.join('\n'));
    process.exit(1);
  }

  const block = `/* DATA_START */\nconst DATA = ${JSON.stringify(units, null, 1)};\n/* DATA_END */`;
  frag = frag.replace(/\/\* DATA_START \*\/[\s\S]*?\/\* DATA_END \*\//, block);
  fs.writeFileSync(fragPath, frag);
  const qCount = units.reduce((s, u) => s + u.lessons.reduce((s2, l) => s2 + l.questions.length, 0), 0);
  console.log(`데이터 주입 완료: 유닛 ${units.length}개 / 레슨 ${units.reduce((s, u) => s + u.lessons.length, 0)}개 / 문항 ${qCount}개`);
}

// 단독 실행용 index.html 생성
const wrapper = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>임플란트 아카데미</title>
${frag}
</html>
`;
// 조각의 <meta viewport>는 그대로 head 흐름에 들어가도록 앞부분에 배치됨
fs.writeFileSync(path.join(dir, 'index.html'), wrapper);
console.log('index.html 생성 완료');
