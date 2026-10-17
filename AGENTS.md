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
- 화면 형태는 등록·수정 여부가 아니라 입력량과 작업 흐름으로 결정합니다. 단순 조회나 금액 하나 등 소수 항목을 짧게 입력하는 작업은 내용 높이에 맞는 팝업을 우선하고, 여러 항목·단계나 긴 편집이 필요한 작업은 전체 화면을 사용합니다. 팝업은 기존 공통 모달을 재사용하고 사방 여백·안전 영역을 확보하며, 작은 화면·큰 글자·키보드가 열린 상태에서도 입력과 버튼에 접근할 수 있도록 내부 스크롤을 지원합니다.
- 입력은 공통 `Field`·선택 컴포넌트를 사용하고 라벨과 입력·선택칸을 같은 행에 배치하는 것을 기본으로 합니다. 좁은 화면·큰 글자·긴 라벨에서는 겹치거나 잘리지 않도록 줄바꿈합니다. 금액 단위는 라벨에 반복하지 않고 입력칸 옆에 표시하며, 도움말·오류는 해당 입력칸 바로 아래에 둡니다.
- 한 줄 텍스트·숫자·검색 입력은 공통 `AppTextInput`의 지우기 버튼을 기본 사용합니다. 값이 있을 때만 표시하고 빈 값·비활성·읽기 전용 상태에서는 숨깁니다. 지우기는 입력만 비우고 포커스를 유지하며 저장·제출하지 않습니다. 여러 줄 입력·특수 입력은 필요에 따라 제외하고 선택값 자체를 지우는 동작에는 적용하지 않습니다.
- 등록·저장·수정·종료·삭제·재시도 등 실행 버튼은 공통 `Button`·`ButtonGroup`을 사용합니다. 둥근 형태·높이·간격을 통일하고, 주요 동작은 연한 파란 배경·파란 글자, 보조 동작은 연한 회색 배경·회색 글자, 삭제 등 위험 동작은 연한 빨간 배경·빨간 글자로 구분합니다. 화면별로 진한 채움·텍스트 전용 실행 버튼을 섞지 않습니다. 탭·필터·선택 항목·아이콘 이동·상단의 작은 공통 액션은 각 용도에 맞는 기존 공통 컴포넌트를 유지합니다. 크기나 ‘수정·선택’ 같은 이름만으로 모두 보조 동작으로 정하지 않고 화면 안에서의 역할과 중요도로 구분합니다. 핵심 정보 입력·변경은 주요 스타일, 부가적인 대상 선택·설정은 보조 스타일을 사용합니다.
- 수정·종료·삭제 등 함께 제공되는 관리 버튼은 공통 버튼 그룹으로 가로 배치합니다. 등록·저장 등 단일 주요 동작은 전체 너비를 허용합니다. 작은 화면이나 큰 글자로 공간이 부족하면 줄바꿈하며, 버튼의 터치 영역은 최소 44를 유지합니다.
- 같은 그룹에서는 취소·보조 동작을 왼쪽, 주요 동작을 오른쪽에 둡니다. 상세 관리 동작은 삭제 → 종료 → 수정, 삭제 → 재등록 순서로 배치합니다. 삭제 확인처럼 삭제가 최종 실행 동작인 경우에는 삭제를 오른쪽에 둡니다.
- 기능 변경에 따라 대체된 코드·스타일·가져오기와 미사용 라이브러리는 별도 요청 없이 정리하되, 다른 기능과 의존성에 필요한 항목은 유지합니다.
- UI 구성·조작 방식이 달라지는 작업은 먼저 선택지와 추천 구성을 설명하고 사용자와 방향을 정한 뒤 구현합니다. 이미 합의한 방향은 반복 확인하지 않습니다.

## 완료 기준

- 모든 작업은 완료 전에 린트와 타입 검사를 실행합니다. 작업별 추가 검증은 해당 스킬을 따릅니다.
- 변경 내용, 검증 결과, 직접 확인하지 못한 부분을 한국어로 간결하게 보고합니다.
