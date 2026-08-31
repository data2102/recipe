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

## 쓰는 법 (지시서 5장)

1. **파랑(`--accent`)은 누를 수 있는 것에만.** "68일" 같은 정보성 표시에 액션색을
   쓰지 마라. 정보는 `--text-primary/secondary/tertiary` 3단계로 구분하고,
   강조가 필요하면 `--warm` 을 쓴다.
2. **한 화면, 한 가지 일.** 빽빽해지면 접는다.
3. **말하듯 쓴다.** "6일 전에 샀어요", "링크를 못 읽었어요. 캡처를 올려주세요."

라이트가 기본이다. `tokens.css` 의 다크(`.theme-dark`)는 모니터링 도구용이라
이 앱에서는 쓰지 않는다.
