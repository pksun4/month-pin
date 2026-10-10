This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## 프로젝트 공통 코드와 변경 기준

- 새 기능과 기존 기능 수정 시 README의 「공통 코드와 데이터 설계 기준」을 적용합니다. 서버·DB 확장을 고려해 공통 선택값과 화면 표시명을 분리합니다.
- 셀렉트·라디오·체크박스의 미리 정의된 선택 항목은 고정 코드로 관리합니다. 단순 참·거짓 flag는 boolean, 사용자 생성 레코드 선택은 ID 참조, 다중 공통 선택은 코드 배열/연결 테이블로 표현합니다.
- 코드 값은 소문자 snake_case, 코드 목록 상수는 대문자 UPPER_SNAKE_CASE, 모델 필드명은 기존 camelCase를 유지합니다. 도메인별 공통 목록·타입을 사용하고 저장 계층에서 허용 값과 관계를 검증합니다.
- 기존 저장 코드를 변경하거나 삭제할 때는 데이터 이전과 참조 보존을 함께 처리합니다. 표시명·아이콘만 바뀌면 코드를 유지합니다.
- 기능 변경에 따라 대체된 코드·스타일·가져오기와 미사용 라이브러리는 별도 요청 없이 정리하되, 다른 기능과 의존성에 필요한 항목은 유지합니다.
- UI 구성·조작 방식이 달라지는 작업은 먼저 선택지와 추천 구성을 설명하고 사용자와 방향을 정한 뒤 구현합니다. 이미 합의한 방향은 반복 확인하지 않습니다.
