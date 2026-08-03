// app.html(조각) → index.html(단독 실행 파일) 빌드 + 커리큘럼 데이터 주입
// 사용법: node build.mjs [data.json]
//
// 검증 규칙은 check.mjs 한 곳에만 있습니다. 여기서는 그대로 불러 씁니다.
import fs from 'node:fs';
import path from 'node:path';
import { loadData, validate } from './check.mjs';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const fragPath = path.join(dir, 'app.html');
let frag = fs.readFileSync(fragPath, 'utf8');

const dataArg = process.argv[2] || path.join(dir, 'data.json');
if (fs.existsSync(dataArg)) {
  const data = loadData(dataArg);
  const { errors, warns, stats } = validate(data);

  if (warns.length) console.warn(`경고 ${warns.length}건 (node check.mjs 로 상세 확인)`);
  if (errors.length) {
    console.error('데이터 검증 실패:\n' + errors.join('\n'));
    process.exit(1);
  }

  const MARKERS = /\/\* DATA_START \*\/[\s\S]*?\/\* DATA_END \*\//;
  if (!MARKERS.test(frag)) {
    console.error('app.html 에서 DATA_START/DATA_END 블록을 찾지 못했습니다.');
    process.exit(1);
  }
  // 같은 데이터로 다시 빌드하면 결과가 동일하다 — 정상이다.
  frag = frag.replace(MARKERS, `/* DATA_START */\nconst DATA = ${JSON.stringify(data)};\n/* DATA_END */`);
  fs.writeFileSync(fragPath, frag);
  console.log(`데이터 주입 완료: 트랙 ${stats.tracks}개 / 유닛 ${stats.units}개 / 레슨 ${stats.lessons}개 / 문항 ${stats.questions}개`);
}

// 단독 실행용 index.html 생성
const wrapper = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>링고 아카데미</title>
${frag}
</html>
`;
// 조각의 <meta viewport>는 그대로 head 흐름에 들어가도록 앞부분에 배치됨
fs.writeFileSync(path.join(dir, 'index.html'), wrapper);
console.log('index.html 생성 완료');
