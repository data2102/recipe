# 여백(Yeobaek) — 복사본

`tokens.css` · `components.css` 는 [data2102/design-system](https://github.com/data2102/design-system)
에서 **그대로 복사해 온 것**이다. 여기서 고치지 마라 — 다음 갱신 때 덮인다.
고칠 일이 있으면 원본 저장소를 고치고 다시 복사한다.

| 항목 | 값 |
|---|---|
| 원본 | https://github.com/data2102/design-system |
| 커밋 | `5e42ad5f755b9ccdb84b633d0ce283a3e1ca434d` |
| 날짜 | 2026-08-13 |

## 갱신

```bash
git clone --depth 1 https://github.com/data2102/design-system /tmp/ds
cp /tmp/ds/tokens.css /tmp/ds/components.css web/app/yeobaek/
# 위 표의 커밋·날짜도 같이 고친다
```

## 왜 복사해 두는가

CDN 이나 서브모듈로 걸면 디자인 시스템이 바뀔 때 앱 화면이 말없이 바뀐다.
복사본은 언제 무엇이 바뀌는지가 커밋에 남는다. 1인 개발에서는 이쪽이 싸다.

## 앱이 어떻게 쓰는가

`globals.css` 가 이 두 파일을 불러온다. 화면은 **`.ds-*` 클래스를 먼저 찾아
쓴다** — 카드는 `.ds-card`, 버튼은 `.ds-btn`, 폼은 `.ds-field`/`.ds-input`,
탭은 `.ds-tabs`, 칩은 `.ds-chip`, 체크박스는 `.ds-check`, 배지는 `.ds-badge`,
안내는 `.ds-banner`. CSS 모듈에는 **배치만** 남긴다. 같은 모양을 모듈에서 다시
그리면 디자인 시스템이 좋아져도 앱은 그대로다.

시스템 기본값을 앱에 맞게 덮어쓰는 건 `globals.css` 아래쪽 한 군데에 모여
있다. 여기(복사본)를 고치지 말고 거기에 적어라.

### 원본에 돌려보낼 것

이 앱에서 덮어쓴 것 중 원본 저장소도 같이 고쳐야 하는 게 둘 있다.

1. **`.ds-tab.on` · `.ds-chip.on` 의 글자색.** `--accent`(#3182f6)는 흰 배경
   대비가 3.71:1 이다. 경계·아이콘 기준(3:1)은 넘지만 **글자 기준(4.5:1)에는
   못 미친다.** `foundations.md` 의 "진한 텍스트 토큰" 규칙대로
   `--accent-strong`(5.71:1)이어야 한다. `a11y_check.py` 는 이 쌍을 UI
   기준으로만 재서 안 걸린다.
2. **무채색 배지.** `.ds-badge` 에는 success/warning/danger 만 있다. "담아뒀어요"
   처럼 성공도 경고도 아닌 그냥 사실을 알릴 자리가 없어서 앱에서 만들어 썼다
   (`RecipeRow.module.css` 의 `.quietBadge`). `.ds-badge-quiet` 로 올릴 만하다.

## 쓰는 법 (지시서 5장)

1. **파랑(`--accent`)은 누를 수 있는 것에만.** "68일" 같은 정보성 표시에 액션색을
   쓰지 마라. 정보는 `--text-primary/secondary/tertiary` 3단계로 구분하고,
   강조가 필요하면 `--warm` 을 쓴다.
2. **한 화면, 한 가지 일.** 빽빽해지면 접는다.
3. **말하듯 쓴다.** "6일 전에 샀어요", "링크를 못 읽었어요. 캡처를 올려주세요."

라이트가 기본이다. `tokens.css` 의 다크(`.theme-dark`)는 모니터링 도구용이라
이 앱에서는 쓰지 않는다.
