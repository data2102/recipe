"use client";

/**
 * 캡처 올리기 → 확인 → 저장 (지시서 4장)
 *
 * 한 화면에서 세 걸음이다. 걸음마다 한 가지만 묻는다.
 *
 *   pick     캡처를 고르거나 레시피를 붙여넣는다
 *   reading  2패스 파싱 (수십 초 걸린다 — 뭘 하는 중인지 말해준다)
 *   confirm  **확정은 접어두고 확인 필요한 것만 펼친다.**
 *            재료 16개를 다 펼치면 화면이 빽빽해서 그냥 저장을 누르게 된다.
 */

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  commit,
  ingest,
  ingestLink,
  ingestShared,
  saveLinkOnly,
  type Draft,
  type DraftItem,
  type IngestResult,
} from "./actions";
import type { Shared } from "./page";
import styles from "./add.module.css";

const MAPPED = "MAPPED";
const CHECK = "CHECK";
const UNMAPPED = "UNMAPPED";

const INSTAGRAM = /instagram\.com/i;
const URL_IN_TEXT = /https?:\/\/\S+/;

/**
 * 공유로 넘어온 글이 이만큼 되면 본문이 통째로 온 것으로 본다.
 * lib/parse/link.ts 의 MIN_BODY_CHARS 와 같은 눈금이다 — 그보다 짧으면
 * 안드로이드가 붙여준 "제목 + 주소" 한 줄이지 레시피가 아니다.
 */
const BODY_ENOUGH = 200;

/**
 * 바뀌지 않는 것을 읽는다 (클립보드가 되는가, 설치돼 있는가).
 * 구독할 게 없어서 해지 함수만 돌려준다 — 첫 그림에서 서버/브라우저가
 * 다른 값을 내야 해서 useState + useEffect 대신 이걸 쓴다.
 */
const noSubscribe = () => () => {};

type Auto = "assets" | "text" | "link" | null;

/**
 * 공유로 들어왔을 때 **버튼을 기다리지 않고 바로 시작할 것인가.**
 *
 * 공유 시트에서 이 앱을 고른 것 자체가 "이거 정리해줘" 다. 넘어와서
 * 한 번 더 누르게 하면 공유가 지름길이 아니게 된다 (지시서 9장 —
 * 공유가 이 제품의 핵심 유입 경로다).
 *
 * /share 는 그대로 파싱하지 않는다. 원본만 보관하고 넘긴다 — 시작은
 * 여기서 하니까 사용자는 흰 화면이 아니라 "읽는 중" 을 본다.
 *
 * 안 시작하는 경우가 둘 있다.
 *   인스타 링크만  링크로는 못 읽는 걸 이미 안다. 8초 태우고 실패를
 *                 보여주느니 캡처를 부탁하는 화면을 바로 낸다 (지시서 4장)
 *   problem 있음   /share 가 이미 실패했다. 직접 올리라고 안내 중이다
 */
function autoStart(shared?: Shared | null): Auto {
  if (!shared || shared.problem) return null;
  if (shared.assetIds.length > 0) return "assets";
  if ((shared.text?.trim().length ?? 0) >= BODY_ENOUGH) return "text";
  if (shared.url && !INSTAGRAM.test(shared.url)) return "link";
  return null;
}

type Fail = Extract<IngestResult, { ok: false }>;

type Phase =
  | { at: "pick"; error?: Fail }
  | { at: "reading" }
  | { at: "linking" }
  | { at: "confirm"; draft: Draft; failed?: string }
  | { at: "saving"; draft: Draft };

export default function Add({ shared }: { shared?: Shared | null }) {
  const router = useRouter();
  const auto = autoStart(shared);
  /*
   * 자동으로 시작할 게 있으면 **첫 화면부터** 읽는 중이다. effect 가 돈
   * 뒤에 바꾸면 올리기 화면이 한 번 번쩍인다 — 공유를 눌렀는데 폼이
   * 스쳐 지나가면 잘못 온 줄 안다.
   */
  const [phase, setPhase] = useState<Phase>(
    auto === null
      ? { at: "pick" }
      : auto === "link"
        ? { at: "linking" }
        : { at: "reading" },
  );
  const [pending, startTransition] = useTransition();

  /*
   * 주소는 여기서 들고 있는다. Pick 안에 두면 "읽는 중" 화면이 뜨는 동안
   * Pick 이 통째로 사라졌다가 다시 그려지면서 **사용자가 붙여넣은 주소가
   * 없어진다.** 링크를 못 읽어 캡처로 넘어가는 게 인스타·유튜브의 정상
   * 경로인데, 그때 주소를 잃으면 source_url 없이 저장된다 (저작권 —
   * 지시서 4장은 원문 주소를 항상 같이 남기라고 한다).
   */
  const [url, setUrl] = useState(shared?.url ?? "");

  /* 자동 시작은 딱 한 번이다. 두 번 돌면 원본도 파싱도 두 벌이 된다 */
  const started = useRef(false);
  useEffect(() => {
    if (started.current || auto === null || !shared) return;
    started.current = true;
    if (auto === "assets") {
      onShared();
    } else if (auto === "link") {
      onLink(shared.url!);
    } else {
      // 붙여넣기 공유 — 넘어온 글을 그대로 파서에 준다. 주소도 같이
      // 넘겨야 source_url 이 남는다 (저작권 — 지시서 4장)
      const form = new FormData();
      form.set("text", shared.text!);
      if (shared.url) form.set("sourceUrl", shared.url);
      startTransition(async () => land(await ingest(form)));
    }
    // 주소에서 온 값이라 화면이 사는 동안 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function land(result: IngestResult) {
    setPhase(
      result.ok ? { at: "confirm", draft: result.draft } : { at: "pick", error: result },
    );
  }

  /*
   * `<form action={...}>` 로 넘기지 않는다.
   *
   * React 는 form action 을 트랜지션 안에서 돌린다. 그 안에서 부른
   * setPhase 는 뒤따르는 비동기 트랜지션과 한 덩어리로 묶여서, 파싱이 다
   * 끝날 때까지 **화면이 안 바뀐다.** 30초짜리 작업 앞에서 아무 반응이
   * 없으면 사용자는 버튼을 또 누른다 (실제로 그렇게 됐다).
   *
   * onSubmit 안에서 부르면 평범한 긴급 갱신이라 그 자리에서 그려진다.
   */
  function onIngest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    /*
     * 링크만 넣었으면 링크를 읽는다.
     *
     * 예전에는 링크를 읽는 버튼이 카드 안에 따로 있었고, 아래 큰 버튼은
     * 캡처·메모만 봤다. 그래서 주소만 붙여넣고 큰 버튼을 누르면
     * "캡처를 올리거나 레시피를 붙여넣어 주세요" 가 떴다 — 방금 주소를
     * 넣었는데 못 본 척하는 셈이다. 인스타 주소일 때는 작은 버튼이 아예
     * 안 나와서 빠져나갈 길도 없었다.
     *
     * 버튼은 하나고, 채워진 것에 맞춰 움직인다 (design-system.md 6장).
     */
    const hasFile = form
      .getAll("images")
      .some((f) => f instanceof File && f.size > 0);
    const hasText = String(form.get("text") || "").trim().length > 0;
    if (!hasFile && !hasText && url.trim()) {
      onLink(url);
      return;
    }

    setPhase({ at: "reading" });
    startTransition(async () => land(await ingest(form)));
  }

  function onLink(url: string) {
    setPhase({ at: "linking" });
    startTransition(async () => land(await ingestLink(url)));
  }

  function onLinkOnly(title: string, url: string) {
    startTransition(async () => {
      await saveLinkOnly(title, url);
      router.push("/?tab=want");
    });
  }

  function onShared() {
    if (!shared) return;
    setPhase({ at: "reading" });
    startTransition(async () =>
      land(await ingestShared(shared.assetIds, shared.url)),
    );
  }

  function onCommit(draft: Draft) {
    setPhase({ at: "saving", draft });
    startTransition(async () => {
      try {
        await commit(draft);
        router.push("/?tab=want");
      } catch (e) {
        // alert 는 브라우저 오류처럼 보이고, 닫고 나면 뭘 해야 하는지가
        // 화면에 안 남는다. 화면 안에 두고 다시 누를 길을 같이 낸다.
        setPhase({
          at: "confirm",
          draft,
          failed: e instanceof Error ? e.message : "저장하지 못했어요.",
        });
      }
    });
  }

  if (phase.at === "linking")
    return <Linking url={url} fromShare={auto !== null} />;
  if (phase.at === "reading") return <Reading fromShare={auto !== null} />;
  if (phase.at === "confirm" || phase.at === "saving") {
    return (
      <Confirm
        draft={phase.draft}
        saving={phase.at === "saving"}
        failed={phase.at === "confirm" ? phase.failed : undefined}
        onChange={(draft) => setPhase({ at: "confirm", draft })}
        onSave={onCommit}
        onBack={() => setPhase({ at: "pick" })}
      />
    );
  }
  return (
    <Pick
      onSubmit={onIngest}
      pending={pending}
      error={phase.error}
      shared={shared}
      url={url}
      setUrl={setUrl}
      onShared={onShared}
      onLinkOnly={onLinkOnly}
    />
  );
}

/* ---------------------------------------------------------------- */

/**
 * 붙박이 상태 안내 — 여백의 .ds-banner (components.md Phase 2).
 *
 * 아이콘은 아웃라인 한 벌로 통일한다 (foundations.md). 이모지를 섞지
 * 않으려고 Tabler 계열 SVG 를 직접 넣는다 — 아이콘 하나 쓰자고 웹폰트를
 * 받아오지 않는다.
 */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ds-banner ds-banner-warning ${styles.notice}`}>
      <svg
        className="ico"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

function Pick({
  onSubmit,
  pending,
  error,
  shared,
  url,
  setUrl,
  onShared,
  onLinkOnly,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** 이름만 저장이 도는 중. 두 번 누르면 두 건이 된다 */
  pending: boolean;
  error?: Fail;
  shared?: Shared | null;
  /** Add 가 들고 있다 — 화면이 바뀌어도 붙여넣은 주소가 살아 있어야 한다 */
  url: string;
  setUrl: (v: string) => void;
  onShared: () => void;
  onLinkOnly: (title: string, url: string) => void;
}) {
  const [count, setCount] = useState(0);
  const [hasText, setHasText] = useState(Boolean(shared?.text?.trim()));
  const fileRef = useRef<HTMLInputElement>(null);
  const gotShared = Boolean(shared?.assetIds.length);

  // 인스타는 링크로 본문을 못 읽는다. 넣어놓고 안 될 걸 알면서
  // 시도하게 만들지 않는다 (지시서 4장).
  const instagram = INSTAGRAM.test(url);

  /*
   * 클립보드에서 바로 받는다.
   *
   * 링크는 거의 다 **다른 앱에서 복사해온 것**이다. 칸을 길게 눌러
   * 붙여넣기 메뉴를 띄우는 것보다 한 번에 끝난다.
   *
   * 되는 브라우저에서만 낸다. 눌러서 거절당하면 칸은 그대로 있으니
   * 손으로 붙여넣으면 된다 — 막다른 길이 되지 않는다.
   */
  const canPaste = useSyncExternalStore(
    noSubscribe,
    () => Boolean(navigator.clipboard?.readText),
    () => false, // 서버는 모른다. 안 내는 쪽으로 그린다
  );
  const [missed, setMissed] = useState(false);

  async function paste() {
    try {
      const hit = (await navigator.clipboard.readText()).match(URL_IN_TEXT);
      setMissed(!hit);
      if (hit) setUrl(hit[0]);
    } catch {
      // 거절했거나 안 되는 브라우저다. 손으로 붙여넣으면 된다
      setMissed(false);
    }
  }

  /*
   * 설치하면 공유 시트에 뜬다 (manifest.ts). 그게 제일 짧은 길인데
   * 설치하기 전에는 그런 길이 있는 줄 모른다. 이미 설치했으면 안 낸다.
   *
   * 처음 그릴 때는 없는 쪽으로 둔다 — 서버는 알 수 없어서, 켰다 껐다
   * 하면 화면이 한 번 튄다.
   */
  const installed = useSyncExternalStore(
    noSubscribe,
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => true, // 서버는 모른다. 안 내는 쪽으로 그린다
  );

  /** 주소만 넣었다 — 누르면 링크를 읽으러 간다 (onIngest 참조) */
  const linkOnly = url.trim().length > 0 && count === 0 && !hasText;

  return (
    <form onSubmit={onSubmit}>
      {/* 공유 시트로 넘어온 것. 여기서 바로 이어가면 다시 고를 필요가 없다 */}
      {gotShared && (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>
            공유받은 캡처 {shared!.assetIds.length}장이 있어요
          </h2>
          <p className={styles.body}>이걸로 바로 정리해드릴까요?</p>
          {shared!.url && <p className={styles.hint}>{shared!.url}</p>}
          <button type="button" className={`ds-btn ds-btn-primary ds-btn-block ${styles.shared}`} onClick={onShared}>
            이걸로 정리해줄게요
          </button>
        </section>
      )}

      {shared?.problem && (
        <Notice>
          {shared.problem}
          <br />
          아래에서 직접 올려주세요.
        </Notice>
      )}

      {/*
        링크가 맨 위다.
        복사해온 주소 한 줄이면 끝나는 게 제일 짧은 길이라 먼저 묻는다.
        캡처는 그 아래 — 인스타처럼 링크로 못 읽는 곳에서 쓰는 길이다.
      */}
      <section className="ds-card">
        <h2 className={styles.cardTitle}>링크를 붙여넣어 주세요</h2>
        <p className={styles.body}>
          읽을 수 있으면 읽고, 안 되면 캡처를 올려달라고 알려드려요.
        </p>
        <div className={`ds-field ${styles.urlField} ${styles.lastField}`}>
          <div className={styles.urlRow}>
            <input
              id="sourceUrl"
              className="ds-input"
              type="url"
              name="sourceUrl"
              aria-label="레시피 링크"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setMissed(false);
              }}
              placeholder="인스타·유튜브·블로그 주소"
            />
            {canPaste && (
              <button
                type="button"
                className={`ds-btn ds-btn-secondary ${styles.paste}`}
                onClick={paste}
              >
                붙여넣기
              </button>
            )}
          </div>
          <span className="ds-help">
            {instagram
              ? "인스타는 링크로는 못 읽어요. 캡처를 올려주세요 — 주소는 같이 보관할게요."
              : missed
                ? "복사해둔 링크가 없어요. 캡처를 올려도 돼요."
                : "유튜브·블로그 주소를 그대로 붙여넣으면 돼요."}
          </span>
        </div>
      </section>

      <section className="ds-card">
        <h2 className={styles.cardTitle}>
          {gotShared ? "다른 캡처를 올려도 돼요" : "캡처를 올려주세요"}
        </h2>
        <p className={styles.body}>
          재료와 만드는 법이 보이면 돼요. 1~3장까지 한 번에 읽어요.
        </p>

        <input
          ref={fileRef}
          id="images"
          className={styles.file}
          type="file"
          name="images"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => setCount(e.target.files?.length ?? 0)}
        />
        <label htmlFor="images" className={styles.drop}>
          {count > 0 ? `캡처 ${count}장 골랐어요` : "캡처 고르기"}
        </label>
      </section>

      <section className="ds-card">
        <h2 className={styles.cardTitle}>글로 붙여넣어도 돼요</h2>
        <textarea
          className="ds-textarea"
          name="text"
          rows={4}
          defaultValue={shared?.text ?? ""}
          onChange={(e) => setHasText(e.target.value.trim().length > 0)}
          placeholder="레시피 본문을 그대로 붙여넣으세요"
        />
      </section>

      {error && (
        <>
          <Notice>
            {error.message}
            {error.hint && (
              <>
                <br />
                {error.hint}
              </>
            )}
          </Notice>
          {/* 못 읽어도 제목은 건졌으면 이름만 저장하는 길을 연다 */}
          {error.linkOnly && (
            <section className="ds-card">
              <p className={styles.body}>
                이름만 저장해두고, 재료는 만들 때 링크에서 봐도 돼요.
              </p>
              <button
                type="button"
                className={`ds-btn ds-btn-secondary ds-btn-block ${styles.linkGo}`}
                disabled={pending}
                onClick={() =>
                  onLinkOnly(error.linkOnly!.title, error.linkOnly!.url)
                }
              >
                {pending
                  ? "저장하는 중이에요"
                  : `“${error.linkOnly.title}” 이름만 저장할게요`}
              </button>
            </section>
          )}
        </>
      )}

      {/*
        공유로 들어왔으면 주 행동은 위쪽("이걸로 정리해줄게요")이다.
        파란 버튼이 한 화면에 둘이면 어느 쪽을 눌러야 할지 갈린다.

        버튼 글자는 **누르면 실제로 일어날 일**을 적는다. 주소만 넣었으면
        링크를 읽으러 가므로 그렇게 적는다 — 인스타는 읽을 수 없다는 걸
        이미 아니까 캡처를 부탁하는 말로 남긴다.
      */}
      <button
        type="submit"
        className={`ds-btn ds-btn-block ${
          gotShared ? "ds-btn-secondary" : "ds-btn-primary"
        }`}
      >
        {gotShared
          ? "올린 걸로 정리해줄게요"
          : linkOnly && !instagram
            ? "링크 읽어볼게요"
            : "정리해줄게요"}
      </button>

      {/* 더 짧은 길이 있다는 것만 알려준다. 설치를 조르지 않는다 */}
      {!installed && (
        <p className={styles.install}>
          홈 화면에 추가해두면 인스타·유튜브에서 공유 버튼만 눌러도 여기로 와요.
        </p>
      )}
    </form>
  );
}

/**
 * 공유로 들어와 자동으로 시작했으면 그렇다고 말한다. 누른 적 없는데
 * 뭔가 돌고 있으면 "내가 보낸 게 맞나" 싶다 — 주소를 같이 보여준다.
 */
function Linking({ url, fromShare }: { url: string; fromShare: boolean }) {
  return (
    <section className="ds-card">
      <h2 className={styles.cardTitle}>
        {fromShare ? "공유받은 링크를 열어보는 중이에요" : "링크를 열어보는 중이에요"}
      </h2>
      <p className={styles.body}>
        읽어도 되는 페이지인지 먼저 확인하고, 본문이 있으면 가져와요.
      </p>
      {url && <p className={styles.hint}>{url}</p>}
    </section>
  );
}

function Reading({ fromShare }: { fromShare: boolean }) {
  return (
    <section className="ds-card">
      <h2 className={styles.cardTitle}>
        {fromShare ? "공유받은 걸 읽는 중이에요" : "읽는 중이에요"}
      </h2>
      <p className={styles.body}>
        재료를 먼저 옮기고, 만드는 법에만 나오는 재료가 있는지 한 번 더 봐요.
      </p>
      <p className={styles.hint}>30초쯤 걸려요.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function Confirm({
  draft,
  saving,
  failed,
  onChange,
  onSave,
  onBack,
}: {
  draft: Draft;
  saving: boolean;
  failed?: string;
  onChange: (d: Draft) => void;
  onSave: (d: Draft) => void;
  onBack: () => void;
}) {
  const [openMapped, setOpenMapped] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const set = (i: number, patch: Partial<DraftItem>) =>
    onChange({
      ...draft,
      items: draft.items.map((it, n) => (n === i ? { ...it, ...patch } : it)),
    });

  const indexed = draft.items.map((item, i) => ({ item, i }));
  const mapped = indexed.filter(({ item }) => item.bucket === MAPPED);
  const check = indexed.filter(({ item }) => item.bucket === CHECK);
  const unmapped = indexed.filter(({ item }) => item.bucket === UNMAPPED);

  return (
    <>
      <section className="ds-card">
        <div className={`ds-field ${styles.lastField}`}>
          <label className="ds-label" htmlFor="title">
            요리 이름
          </label>
          <input
            id="title"
            className="ds-input"
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
          />
          <span className="ds-help">
            재료 {draft.items.length} · 만드는 법 {draft.steps.length}단계
          </span>
        </div>
      </section>

      {/* 확인 필요 — 이것만 펼쳐서 물어본다 */}
      {check.length > 0 && (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>이것만 확인해주세요</h2>
          <ul className={styles.checkList}>
            {check.map(({ item, i }) => (
              <li key={i} className={styles.checkItem}>
                <Editable
                  item={item}
                  open={editing === i}
                  onOpen={() => setEditing(editing === i ? null : i)}
                  onChange={(patch) => set(i, patch)}
                />
                {item.evidence && <p className={styles.why}>{item.evidence}</p>}
                {/*
                  답하기 전에는 어느 쪽도 고른 것처럼 보이면 안 된다.
                  안 물어본 걸 답한 척하는 셈이고, 사용자가 "이미 골랐네" 하고
                  넘어가면 그 기본값이 조용히 확정된다.
                */}
                <div className={styles.yesno}>
                  <button
                    type="button"
                    className={
                      `ds-btn ds-btn-secondary ${item.answered && item.confirmed ? styles.picked : ""}`
                    }
                    onClick={() => set(i, { confirmed: true, answered: true })}
                  >
                    넣을게요
                  </button>
                  <button
                    type="button"
                    className={
                      `ds-btn ds-btn-secondary ${item.answered && !item.confirmed ? styles.picked : ""}`
                    }
                    onClick={() => set(i, { confirmed: false, answered: true })}
                  >
                    아니요
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 확정 — 뭉쳐서 접어둔다 */}
      {mapped.length > 0 && (
        <section className="ds-card">
          <button
            type="button"
            className={styles.foldHead}
            onClick={() => setOpenMapped(!openMapped)}
            aria-expanded={openMapped}
          >
            <span>다 알아봤어요 {mapped.length}개</span>
            <span className={styles.hint}>{openMapped ? "접기" : "펼치기"}</span>
          </button>
          {openMapped ? (
            <ul className={styles.checkList}>
              {mapped.map(({ item, i }) => (
                <li key={i} className={styles.checkItem}>
                  <Editable
                    item={item}
                    open={editing === i}
                    onOpen={() => setEditing(editing === i ? null : i)}
                    onChange={(patch) => set(i, patch)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.chips}>
              {mapped.map(({ item }) => item.label).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* 미분류 — 원문 그대로 저장한다. 추측하지 않는다 */}
      {unmapped.length > 0 && (
        <section className="ds-card">
          <h2 className={styles.cardTitle}>처음 보는 재료예요</h2>
          <p className={styles.body}>
            적힌 그대로 저장할게요. 장보기에서는 따로 한 줄로 나와요.
          </p>
          <ul className={styles.checkList}>
            {unmapped.map(({ item, i }) => (
              <li key={i} className={styles.checkItem}>
                <Editable
                  item={item}
                  open={editing === i}
                  onOpen={() => setEditing(editing === i ? null : i)}
                  onChange={(patch) => set(i, patch)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        같은 초안은 두 번 저장되지 않는다 (lib/parse/store.ts 의 save).
        그걸 말해줘야 다시 눌러도 되는지 망설이지 않는다.
      */}
      {failed && (
        <Notice>
          {failed}
          <br />
          다시 눌러도 돼요 — 같은 걸 두 번 저장하지는 않아요.
        </Notice>
      )}

      <button
        type="button"
        className="ds-btn ds-btn-primary ds-btn-block"
        disabled={saving}
        onClick={() => onSave(draft)}
      >
        {saving ? "저장하는 중이에요" : failed ? "다시 저장할게요" : "저장할게요"}
      </button>
      <button type="button" className="ds-btn ds-btn-secondary ds-btn-block" onClick={onBack} disabled={saving}>
        다시 올릴래요
      </button>
    </>
  );
}

/** 탭하면 이름과 수량을 직접 고칠 수 있다 (지시서 4장) */
function Editable({
  item,
  open,
  onOpen,
  onChange,
}: {
  item: DraftItem;
  open: boolean;
  onOpen: () => void;
  onChange: (patch: Partial<DraftItem>) => void;
}) {
  if (!open) {
    return (
      <button type="button" className={styles.nameRow} onClick={onOpen}>
        <span className={styles.name}>{item.label}</span>
        {item.raw_qty && <span className={styles.qty}>{item.raw_qty}</span>}
      </button>
    );
  }
  return (
    <div className={styles.editRow}>
      <input
        className="ds-input"
        value={item.raw_name}
        aria-label="재료 이름"
        onChange={(e) => onChange({ raw_name: e.target.value })}
      />
      <input
        className={`ds-input ${styles.qtyInput}`}
        value={item.raw_qty ?? ""}
        aria-label="수량"
        placeholder="수량"
        onChange={(e) => onChange({ raw_qty: e.target.value })}
      />
      <button type="button" className={`ds-btn ds-btn-secondary ${styles.done}`} onClick={onOpen}>
        됐어요
      </button>
    </div>
  );
}
