# 금융기관 로고

2026-10-10에 확인한 공식 사이트 아이콘과 공식 앱 아이콘입니다. 앱에 함께 번들링하며 런타임 네트워크 요청은 하지 않습니다. 브랜드의 색상·비율은 유지하고 화면에서 `contain`으로 표시합니다.

은행 10곳·카드사 9곳의 기존 코드를 `src/data/provider-logos.ts`에서 14개 이미지에 연결합니다. 같은 그룹의 통장·카드는 로고를 공유하고, 항목명 아래의 통장/카드 텍스트로 구분합니다. 이미지 변경에는 DB 이전이 필요하지 않습니다.

| 파일 | 출처 | 사용 코드 |
| --- | --- | --- |
| kb.png | [KB금융 공식 CI 심볼 PNG](https://www.kbfg.com/common/jsp/fileDownUtil.jsp?filepath=/kor/about/__attachFile/KB_SymbolMark_png.zip) | bank_kb, card_kb |
| shinhan.png | [신한금융 공식 사이트 아이콘](https://www.shinhangroup.com/resources/publish/kr/images/common/favicon_192_192.png) | bank_shinhan, card_shinhan |
| hana.png | [하나금융 공식 사이트 아이콘](https://www.hanafn.com/assets/img/favicon/android-chrome-192x192.png) | bank_hana, card_hana |
| woori.png | [우리금융 공식 사이트 아이콘](https://www.woorifg.com/common/images/favicon.ico) | bank_woori, card_woori |
| nh.png | [농협 공식 CI 심벌 GIF](https://www.nonghyup.com/cmm/file/resourceDownLoad.do?filepath=ai02.zip) | bank_nh, card_nh |
| ibk.png | [IBK기업은행 공식 글로벌 사이트 아이콘](https://global.ibk.co.kr/global/images/pc/common/ico_global.png) | bank_ibk |
| kakao.png | [카카오뱅크 공식 사이트 아이콘](https://www.kakaobank.com/view/images/favicon/favicon-bl.png) | bank_kakao |
| kbank.png | [케이뱅크 공식 브랜드 사이트 아이콘](https://brand.kbanknow.com/assets/images/favicon.png) | bank_kbank |
| toss.png | [토스뱅크 공식 사이트에서 참조하는 아이콘](https://static.toss.im/tds/favicon/favicon-196x196.png) | bank_toss |
| sc.png | [SC제일은행 공식 사이트 아이콘](https://www.standardchartered.co.kr/hp/cms/hp/img/favicon.svg?230321) | bank_sc |
| samsung.png | [삼성카드 공식 사이트 아이콘](https://static12.samsungcard.com/images/personal/samsungcard-icon-180x180.png) | card_samsung |
| hyundai.jpg | [현대카드 공식 앱](https://apps.apple.com/kr/app/id702653088)의 [앱 아이콘](https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/23/8e/e3/238ee381-7f8b-0c2a-3601-2d15df53b82c/AppIcon-0-0-1x_U007ephone-0-1-0-sRGB-85-220.png/512x512bb.jpg) | card_hyundai |
| lotte.png | [롯데카드 공식 사이트 아이콘](https://image.lottecard.co.kr/webapp/pc/images/favicon/favicon.ico) | card_lotte |
| bc.png | [BC카드 공식 사이트 아이콘](https://www.bccard.com/favicon.ico) | card_bc |

ICO는 PNG로 형식만 변환했습니다. SC제일은행 SVG는 비율·색상을 유지해 192×192 PNG로 렌더링했습니다. IBK는 저해상도 파비콘 대신 공식 170×164 심볼을 사용합니다. KB는 노란 사각형 배경 없는 공식 1686×1201 PNG, 농협은 공식 1288×1607 GIF를 PNG로 형식만 변환해 사용합니다. 두 심볼은 원본 투명 배경과 색상·비율을 유지합니다. 현대카드·롯데카드·삼성카드는 공식 서비스 아이콘을 사용합니다.

고정비·홈·연결 고정비에서는 결제수단 설명 앞의 18×18 영역에 실제 로고를 최대 15로 표시합니다. 결제수단 목록·등록·상세 화면은 실제 로고를 최대 24로 제한합니다.
