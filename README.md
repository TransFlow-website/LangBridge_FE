# TransFlow Frontend

웹페이지 크롤링 및 번역 서비스 프론트엔드

## ✨ 주요 기능

### 🌐 웹페이지 번역
- URL을 입력하면 해당 페이지를 크롤링하여 번역
- 원본 텍스트와 번역된 텍스트를 한 번에 확인
- 번역 결과 복사 기능

### 📝 텍스트 번역 (개발 중)
- 직접 입력한 텍스트를 실시간 번역
- 다국어 지원

### 🎯 기타 기능
- 자동 언어 감지
- 언어 교환 (스왑)
- 반응형 UI (모바일, 태블릿, 데스크톱)
- 다크모드 지원

## 🛠 기술 스택

- **React 18.3** - UI 라이브러리
- **TypeScript** - 타입 안정성
- **Vite** - 빠른 개발 서버 및 빌드 도구
- **React Router** - 클라이언트 사이드 라우팅
- **Axios** - HTTP 클라이언트

## 🚀 시작하기

### 1. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하세요:

```bash
# .env
VITE_API_URL=http://localhost:8080/api
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 백엔드 서버 실행

먼저 TransFlow_BE 백엔드 서버가 실행 중이어야 합니다:

```bash
# TransFlow_BE 디렉토리에서
./gradlew bootRun
# 또는
gradle bootRun
```

백엔드는 기본적으로 `http://localhost:8080`에서 실행됩니다.

### 4. 프론트엔드 개발 서버 실행

```bash
npm start
# 또는
npm run dev
```

개발 서버가 `http://localhost:3000`에서 실행됩니다.

## 📁 프로젝트 구조

```
TransFlow_FE/
├── src/
│   ├── pages/              # 페이지 컴포넌트
│   │   ├── Home.tsx        # 홈 페이지
│   │   ├── Home.css
│   │   ├── Translation.tsx # 번역 페이지 (URL & 텍스트)
│   │   └── Translation.css
│   ├── services/           # API 서비스
│   │   └── api.ts          # 백엔드 API 클라이언트
│   ├── App.tsx             # 메인 앱 컴포넌트
│   ├── main.tsx            # 엔트리 포인트
│   └── index.css           # 글로벌 스타일
├── public/                 # 정적 파일
├── index.html              # HTML 템플릿
├── package.json            # 의존성 관리
├── tsconfig.json           # TypeScript 설정
└── vite.config.ts          # Vite 설정
```

## 🎮 사용 방법

### 웹페이지 번역

1. 번역 페이지로 이동
2. "🌐 웹페이지 번역" 탭 선택
3. 번역할 웹페이지 URL 입력 (예: `https://example.com`)
4. 원하는 타겟 언어 선택
5. "🔍 크롤링 & 번역" 버튼 클릭
6. 원본 텍스트와 번역 결과 확인
7. 필요시 "📋 복사" 버튼으로 클립보드에 복사

### 텍스트 번역 (개발 중)

1. 번역 페이지로 이동
2. "📝 텍스트 번역" 탭 선택
3. 번역할 텍스트 입력
4. 원본 언어 및 타겟 언어 선택
5. "번역하기" 버튼 클릭

## 🌍 지원 언어

- 한국어 (ko)
- English (en)
- 日本語 (ja)
- 中文 (zh)
- Español (es)
- Français (fr)
- Deutsch (de)
- Italiano (it)
- Português (pt)

※ DeepL API를 사용하여 고품질 번역을 제공합니다.

## 📝 개발 스크립트

- `npm start` 또는 `npm run dev` - 개발 서버 시작 (포트 3000)
- `npm run build` - 프로덕션 빌드
- `npm run preview` - 빌드된 앱 프리뷰
- `npm run lint` - ESLint 실행

## 🔧 백엔드 API 엔드포인트

### 웹페이지 번역
```
POST /api/translate/webpage
Content-Type: application/json

Request Body:
{
  "url": "https://example.com",
  "targetLang": "KO",
  "sourceLang": "EN" // optional
}

Response:
{
  "originalUrl": "https://example.com",
  "originalText": "...",
  "translatedText": "...",
  "sourceLang": "EN",
  "targetLang": "KO",
  "success": true,
  "errorMessage": null
}
```

### 헬스체크
```
GET /api/translate/health

Response: "Translation service is running!"
```

## 🐛 트러블슈팅

### 백엔드 연결 오류

```
서버와 통신할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.
```

**해결 방법:**
1. TransFlow_BE 서버가 실행 중인지 확인
2. 백엔드가 `http://localhost:8080`에서 실행 중인지 확인
3. `.env` 파일에 올바른 API URL이 설정되어 있는지 확인
4. CORS 설정이 올바른지 확인

### URL 형식 오류

```
올바른 URL 형식이 아닙니다. (예: https://example.com)
```

**해결 방법:**
- URL이 `http://` 또는 `https://`로 시작하는지 확인
- 올바른 도메인 형식인지 확인

## 🔜 향후 계획

- [ ] 텍스트 번역 API 연동
- [ ] 번역 히스토리 저장 및 조회
- [ ] 즐겨찾기 URL 관리
- [ ] 파일 업로드 번역
- [ ] 음성 입력 기능
- [ ] 실시간 번역
- [ ] 사용자 인증 및 프로필
- [ ] 번역 품질 개선 피드백

## 📄 라이선스

MIT

## 👥 기여

이 프로젝트는 TransFlow 팀에 의해 개발되었습니다.

## 📞 문의

문제가 발생하거나 제안 사항이 있으시면 이슈를 등록해주세요.
