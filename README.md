# 아키텍트 칼럼 — 배포 가이드

## 스택
- **Cloudflare Pages** — 프론트엔드 + API (Functions)
- **Cloudflare D1** — 글 저장 (SQLite)
- **Cloudflare R2** — 미디어 파일 (mp4, gif, png, jpg 등)

---

## 1. 사전 준비

```bash
npm install -g wrangler
wrangler login
```

---

## 2. D1 데이터베이스 생성

```bash
wrangler d1 create architect-column-db
```

출력된 `database_id`를 `wrangler.toml`의 `database_id`에 붙여넣기.

```bash
# 스키마 적용
wrangler d1 execute architect-column-db --file=schema.sql
```

---

## 3. R2 버킷 생성

```bash
wrangler r2 bucket create architect-column-media
```

**R2 퍼블릭 액세스 활성화:**
Cloudflare 대시보드 → R2 → `architect-column-media` → Settings → Public Access → Enable

활성화 후 표시되는 퍼블릭 URL을 메모 (예: `https://pub-xxxx.r2.dev`)

---

## 4. GitHub 레포 연결 + Pages 배포

```bash
git init
git add .
git commit -m "init"
# GitHub에 레포 생성 후
git remote add origin https://github.com/YOUR_ID/architect-column
git push -u origin main
```

Cloudflare 대시보드 → Pages → Create a project → Connect to Git → 레포 선택  
**Build settings:**
- Framework preset: None
- Build command: (비워두기)
- Build output directory: `public`

**D1 + R2 바인딩:**  
Pages → Settings → Functions → D1 database bindings → `DB` → `architect-column-db`  
Pages → Settings → Functions → R2 bucket bindings → `BUCKET` → `architect-column-media`

---

## 5. 환경변수 설정

Pages → Settings → Environment variables → Production

### PASSWORD_HASH 생성

```bash
# 사용할 비밀번호의 SHA-256 hex
echo -n "여기에비밀번호입력" | shasum -a 256
# 또는 PowerShell:
# [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes("비밀번호"))).Replace("-","").ToLower()
```

### JWT_SECRET 생성

```bash
openssl rand -hex 32
```

| 변수명 | 값 |
|---|---|
| `PASSWORD_HASH` | 위에서 생성한 sha256 hex (64자) |
| `JWT_SECRET` | 위에서 생성한 랜덤 hex (64자) |
| `R2_PUBLIC_URL` | `https://pub-xxxx.r2.dev` (R2 퍼블릭 URL) |

---

## 6. 재배포

환경변수 설정 후 Pages → Deployments → 최신 배포 → Retry deployment

---

## 사용법

1. 사이트 접속 → 비밀번호 입력
2. **새 글** 버튼으로 에디터 열기
3. 마크다운으로 작성, **파일 첨부** 버튼으로 이미지/영상 업로드
4. 업로드된 파일은 커서 위치에 자동 삽입 (`![이름](URL)` 형식)
5. **미리보기** 탭으로 렌더링 확인
6. **저장** → 목록으로 이동

### 마크다운 팁

```markdown
# 제목 1
## 제목 2

**굵게** *기울임*

> 인용문

![이미지 설명](https://...)
![영상 설명](https://.../파일.mp4)  ← mp4는 자동으로 <video> 태그로 렌더링

\`\`\`js
코드 블록
\`\`\`
```

---

## 폴더 구조

```
architect-column/
├── public/
│   └── index.html          # SPA 전체
├── functions/
│   ├── _middleware.js       # JWT 인증 미들웨어
│   └── api/
│       ├── auth.js          # 로그인/로그아웃
│       ├── posts.js         # 글 CRUD
│       └── media.js         # R2 파일 업로드
├── schema.sql               # D1 초기 스키마
└── wrangler.toml            # Cloudflare 설정
```
