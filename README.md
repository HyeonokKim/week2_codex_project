# US Net Liquidity Monitor

미국 순유동성과 종목별 최대 옵션 미결제약정을 한 화면에서 보는 간단한 대시보드입니다.

## 실행

```bash
npm start
```

기본 주소는 `http://localhost:3000` 입니다.

## 포함 기능

- `FRED` 시계열을 사용한 미국 순유동성 계산
- `FRED` 시계열을 사용한 달러/원, 엔/원 모니터링
- 기간 전환이 가능한 순유동성 차트
- `Nasdaq Trader` 심볼 파일 기반 미국 상장 종목 검색
- `Nasdaq` 옵션 체인 기반 최대 `Open Interest` 콜옵션/풋옵션 요약
- 페이지 오픈 중 자동 갱신

## 데이터 계산

순유동성 공식:

```text
Net Liquidity = WALCL - (RRPONTSYD + WDTGAL)
```

- `WALCL`: Federal Reserve total assets
- `WDTGAL`: Treasury General Account
- `RRPONTSYD`: Overnight reverse repo

환율:

```text
USD/KRW = DEXKOUS
100 JPY/KRW = (DEXKOUS / DEXJPUS) * 100
```

- `DEXKOUS`: South Korean won per 1 U.S. dollar
- `DEXJPUS`: Japanese yen per 1 U.S. dollar
- 엔/원은 한국에서 자주 보는 방식에 맞춰 `100엔당 원화` 기준으로 표시합니다.

참고:

- `WALCL`, `WDTGAL`은 백만 달러 단위입니다.
- `RRPONTSYD`는 십억 달러 단위로 내려오기 때문에 서버에서 백만 달러 단위로 변환합니다.
- 역레포는 일별 관측값이라 각 주간 스냅샷 시점 직전의 최신값을 사용합니다.

## 제한 사항

- 옵션 요약은 Nasdaq 지연 데이터 기준입니다.
- 최대 물량은 `Open Interest` 기준으로 계산합니다.
- 무료 외부 데이터 소스 구조가 바뀌면 어댑터 수정이 필요할 수 있습니다.

## 갱신 정책

- 순유동성 API 캐시: 5분
- 옵션 API 캐시: 30초
- 화면 자동 갱신: 순유동성 5분, 옵션 30초
- 탭이 다시 활성화되면 즉시 최신 데이터를 다시 확인합니다.
