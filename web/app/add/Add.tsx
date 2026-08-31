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

import { useRef, useState, useTransition } from "react";
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

type Fail = Extract<IngestResult, { ok: false }>;

type Phase =
  | { at: "pick"; error?: Fail }
  | { at: "reading" }
  | { at: "linking" }
  | { at: "confirm"; draft: Draft; failed?: string }
  | { at: "saving"; draft: Draft };

export default function Add({ shared }: { shared?: Shared | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ at: "pick" });
  const [pending, startTransition] = useTransition();

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

  if (phase.at === "linking") return <Linking />;
  if (phase.at === "reading") return <Reading />;
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
      onShared={onShared}
      onLink={onLink}
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
  onShared,
  onLink,
  onLinkOnly,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** 이름만 저장이 도는 중. 두 번 누르면 두 건이 된다 */
  pending: boolean;
  error?: Fail;
  shared?: Shared | null;
  onShared: () => void;
  onLink: (url: string) => void;
  onLinkOnly: (title: string, url: string) => void;
}) {
  const [count, setCount] = useState(0);
  const [url, setUrl] = useState(shared?.url ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const gotShared = Boolean(shared?.assetIds.length);

  // 인스타는 링크로 본문을 못 읽는다. 넣어놓고 안 될 걸 알면서
  // 시도하게 만들지 않는다 (지시서 4장).
  const instagram = /instagram\.com/i.test(url);

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
          placeholder="레시피 본문을 그대로 붙여넣으세요"
        />
      </section>

      <section className="ds-card">
        <div className={`ds-field ${styles.lastField}`}>
          <label className="ds-label" htmlFor="sourceUrl">
            링크가 있으면 붙여넣어 주세요
          </label>
          <input
            id="sourceUrl"
            className="ds-input"
            type="url"
            name="sourceUrl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="인스타·유튜브·블로그 주소"
          />
          <span className="ds-help">
            {instagram
              ? "인스타는 링크로는 못 읽어요. 캡처를 올려주세요 — 주소는 같이 보관할게요."
              : "읽을 수 있으면 읽고, 안 되면 캡처를 올려달라고 알려드려요."}
          </span>
        </div>
        {url.trim() && !instagram && (
          <button
            type="button"
            className={`ds-btn ds-btn-secondary ds-btn-block ${styles.linkGo}`}
            onClick={() => onLink(url)}
          >
            링크 읽어볼게요
          </button>
        )}
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
      */}
      <button
        type="submit"
        className={`ds-btn ds-btn-block ${
          gotShared ? "ds-btn-secondary" : "ds-btn-primary"
        }`}
      >
        {gotShared ? "올린 걸로 정리해줄게요" : "정리해줄게요"}
      </button>
    </form>
  );
}

function Linking() {
  return (
    <section className="ds-card">
      <h2 className={styles.cardTitle}>링크를 열어보는 중이에요</h2>
      <p className={styles.body}>
        읽어도 되는 페이지인지 먼저 확인하고, 본문이 있으면 가져와요.
      </p>
    </section>
  );
}

function Reading() {
  return (
    <section className="ds-card">
      <h2 className={styles.cardTitle}>읽는 중이에요</h2>
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
