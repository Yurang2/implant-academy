# 배포 안내

이 앱은 빌드 없이 `index.html` 하나로 동작합니다. 정적 호스팅이면 어디든 올릴 수 있습니다.

## GitHub Pages (권장)

### 1. 빈 저장소 만들기

https://github.com/new?name=implant-academy 에서 저장소를 만듭니다.
README·.gitignore·라이선스는 **모두 체크 해제** 하세요 (이미 로컬에 커밋되어 있습니다).

### 2. 푸시하기

```bash
cd D:\Git\Study\implant-academy && git push -u origin main
```

### 3. 저장소를 Public으로 두기

무료 계정에서 GitHub Pages를 쓰려면 저장소가 **Public** 이어야 합니다.
Private으로 만들었다면 Settings 맨 아래 **Danger Zone → Change repository visibility →
Change to public** 에서 전환합니다. Private을 유지하려면 GitHub Pro 이상이 필요합니다.

저장소가 Private인지 확인하는 방법: 로그아웃 상태(시크릿 창)로 저장소 주소를 열었을 때
`Page not found` 가 뜨면 Private입니다.

### 4. Pages 켜기

저장소 → **Settings** → **Pages** → Source를 `Deploy from a branch`,
Branch를 `main` / `/ (root)` 로 지정하고 Save.

1~2분 뒤 아래 주소로 접속됩니다.

```
https://yurang2.github.io/implant-academy/
```

이 주소는 로그인 없이 누구나 열 수 있고, 휴대폰에서도 그대로 동작합니다.

## 내용을 수정한 뒤 다시 배포하기

문항은 [data.json](data.json)만 고치면 됩니다.

```bash
cd D:\Git\Study\implant-academy && node check.mjs && node dupcheck.mjs && node build.mjs
```

검증을 통과하면 `index.html`이 새로 생성됩니다. 그 뒤 커밋하고 푸시하면 Pages가 자동으로 갱신됩니다.

```bash
cd D:\Git\Study\implant-academy && git add -A && git commit -m "문항 수정" && git push
```

## 다른 호스팅을 쓰는 경우

`index.html` 파일 하나만 업로드하면 됩니다. 외부 요청(폰트·스크립트·이미지 CDN)이 전혀 없어
사내 파일 서버나 오프라인 환경에서도 그대로 열립니다.

## 학습 기록에 대해

진도·XP·연속 학습일·오답 노트는 기본적으로 **접속한 기기의 브라우저 저장소**에
이름별로 저장됩니다. 아래 동기화 서버를 켜면 기기 간에 자동으로 이어집니다.

## 학습 기록 동기화 서버 (선택, 무료)

앱은 오프라인 우선으로 동작하고, 동기화가 설정돼 있으면 기록이 바뀔 때마다
서버로 자동 저장합니다. 서버는 [sync-worker.js](sync-worker.js) 파일 하나로,
Cloudflare Workers 무료 플랜에 5분이면 올릴 수 있습니다.

### 1. Worker 만들기

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**
2. 이름은 아무거나 (예: `lingo-sync`) → **Deploy**
3. **Edit code** 를 눌러 기본 코드를 지우고 `sync-worker.js` 내용을 붙여넣기 → **Deploy**

### 2. 저장소(KV) 연결하기

1. 대시보드 → **Storage & Databases** → **KV** → **Create namespace** (이름: `lingo-sync-kv`)
2. 만든 Worker → **Settings** → **Bindings** → **Add** → **KV namespace**
   - Variable name: `SYNC_KV` (정확히 이 이름이어야 합니다)
   - KV namespace: 방금 만든 것 선택 → Save

### 3. 앱에 연결하기

1. Worker 주소를 복사합니다 (예: `https://lingo-sync.<계정>.workers.dev`)
2. 앱 → 프로필(오른쪽 위 아바타) → **클라우드 동기화**에
   서버 주소와 **동기화 코드**(비밀 문구, 예: `우리집고양이는츄르만먹어`)를 입력 → 저장
3. 다른 기기에서 **같은 이름으로 로그인**하고 같은 주소·코드를 넣으면 기록이 이어집니다.

### 동작 방식과 한계

- 슬롯 키는 브라우저가 `동기화 코드 + 이름`을 해시해 만듭니다. 코드 원문은 전송되지 않고,
  코드를 아는 사람만 해당 기록을 읽고 쓸 수 있습니다. 저장되는 것은 학습 진도뿐입니다.
- 병합 규칙: XP·별점·진도는 큰 쪽을, 오답 노트는 합집합을, 스트릭은 최근에 학습한
  기기 쪽을 따릅니다. 두 기기에서 **동시에** 학습하면 한쪽 XP 일부가 병합에서 밀릴 수
  있습니다 (진도·별점은 안전).
- 오프라인에서도 평소처럼 동작하고, 온라인이 되면 자동으로 다시 밀어 올립니다.
