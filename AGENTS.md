# Month Pin 공통 작업 규칙

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## 문서 역할과 작업별 스킬

- 이 문서는 작업 전반에 적용할 공통 규칙을 관리합니다. 상세 설계와 현재 동작은 README의 관련 절을 참고하고, 작업별 수행 절차는 아래 스킬에서 관리합니다.
- 화면을 실제로 추가·수정할 때는 [monthpin-screen](.agents/skills/monthpin-screen/SKILL.md)을 사용합니다.
- 저장 필드·공통 코드·레코드 관계·저장 동작을 변경할 때는 [monthpin-data-change](.agents/skills/monthpin-data-change/SKILL.md)를 사용합니다.
- 두 범위가 함께 바뀌면 두 스킬의 관련 절차를 적용합니다. 설명·문서 작업만 할 때는 구현 스킬을 불러올 필요가 없습니다.
- 공통 규칙을 스킬에 복사하지 않고 이 문서와 README를 참조합니다.

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

## 데이터 공통 규칙

- 새 기능과 기존 기능 수정 시 README의 「공통 코드와 데이터 설계 기준」을 적용합니다. 서버·DB 확장을 고려해 공통 선택값과 화면 표시명을 분리합니다.
- 셀렉트·라디오·체크박스의 미리 정의된 선택 항목은 고정 코드로 관리합니다. 단순 참·거짓 flag는 boolean, 사용자 생성 레코드 선택은 ID 참조, 다중 공통 선택은 코드 배열/연결 테이블로 표현합니다.
- 코드 값은 소문자 snake_case, 코드 목록 상수는 대문자 UPPER_SNAKE_CASE, 모델 필드명은 기존 camelCase를 유지합니다. 도메인별 공통 목록·타입을 사용하고 저장 계층에서 허용 값과 관계를 검증합니다.
- 기존 저장 코드를 변경하거나 삭제할 때는 데이터 이전과 참조 보존을 함께 처리합니다. 표시명·아이콘만 바뀌면 코드를 유지합니다.

## UI와 변경 범위

- 기존 공통 컴포넌트와 색상·타이포그래피를 우선 재사용합니다. 화면과 데이터 읽기·쓰기 로직을 분리합니다.
- 기능 변경에 따라 대체된 코드·스타일·가져오기와 미사용 라이브러리는 별도 요청 없이 정리하되, 다른 기능과 의존성에 필요한 항목은 유지합니다.
- UI 구성·조작 방식이 달라지는 작업은 먼저 선택지와 추천 구성을 설명하고 사용자와 방향을 정한 뒤 구현합니다. 이미 합의한 방향은 반복 확인하지 않습니다.

## 완료 기준

- 모든 작업은 완료 전에 린트와 타입 검사를 실행합니다. 작업별 추가 검증은 해당 스킬을 따릅니다.
- 변경 내용, 검증 결과, 직접 확인하지 못한 부분을 한국어로 간결하게 보고합니다.
