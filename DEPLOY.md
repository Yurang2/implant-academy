# 배포 안내

이 앱은 빌드 없이 `index.html` 하나로 동작합니다. 정적 호스팅이면 어디든 올릴 수 있습니다.

## GitHub Pages (권장)

### 1. 빈 저장소 만들기

https://github.com/new?name=implant-academy 에서 저장소를 만듭니다.
README·.gitignore·라이선스는 **모두 체크 해제** 하세요 (이미 로컬에 커밋되어 있습니다).

> 무료 계정에서 GitHub Pages를 쓰려면 저장소가 **Public** 이어야 합니다.
> Private으로 두려면 GitHub Pro 이상이 필요합니다.

### 2. 푸시하기

```bash
cd D:\Git\Study\implant-academy && git push -u origin main
```

### 3. Pages 켜기

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

진도·XP·연속 학습일은 **접속한 기기의 브라우저 저장소**에 이름별로 저장됩니다.
서버가 없으므로 기기 간 동기화는 되지 않습니다. 여러 기기에서 이어서 학습하거나
관리자가 팀 전체 진도를 보려면 별도의 백엔드가 필요합니다.
